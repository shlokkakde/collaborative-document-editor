from channels.testing import WebsocketCommunicator
from django.test import TransactionTestCase

from core.asgi import application
from .models import Document


class DocumentConsumerTests(TransactionTestCase):
    async def test_document_update_broadcasts_to_second_client(self):
        document = await Document.objects.acreate(title="Plan", content="")

        first = WebsocketCommunicator(
            application,
            f"/ws/documents/{document.id}/?clientId=first&name=First",
        )
        second = WebsocketCommunicator(
            application,
            f"/ws/documents/{document.id}/?clientId=second&name=Second",
        )

        connected, _ = await first.connect()
        self.assertTrue(connected)
        await first.receive_json_from()

        connected, _ = await second.connect()
        self.assertTrue(connected)
        await second.receive_json_from()
        await first.receive_json_from()

        await first.send_json_to(
            {
                "type": "document.update",
                "content": "Shared line",
            }
        )

        message = await second.receive_json_from()
        self.assertEqual(message["type"], "document.update")
        self.assertEqual(message["document"]["content"], "Shared line")
        self.assertEqual(message["clientId"], "first")

        await first.disconnect()
        await second.disconnect()
