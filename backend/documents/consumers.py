from urllib.parse import parse_qs

from asgiref.sync import sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.db import transaction

from .models import Document
from .serializers import document_to_dict


class DocumentConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        self.document_id = self.scope["url_route"]["kwargs"]["document_id"]
        self.group_name = f"document_{self.document_id}"
        query = parse_qs(self.scope.get("query_string", b"").decode("utf-8"))
        self.client_id = query.get("clientId", ["anonymous"])[0]
        self.name = query.get("name", ["Guest"])[0][:40]

        document = await self.get_document()
        if not document:
            await self.close(code=4404)
            return

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        await self.send_json(
            {
                "type": "document.snapshot",
                "document": document_to_dict(document),
                "presence": {
                    "clientId": self.client_id,
                    "name": self.name,
                },
            }
        )
        await self.channel_layer.group_send(
            self.group_name,
            {
                "type": "presence.join",
                "clientId": self.client_id,
                "name": self.name,
                "channel": self.channel_name,
            },
        )

    async def disconnect(self, close_code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_send(
                self.group_name,
                {
                    "type": "presence.leave",
                    "clientId": getattr(self, "client_id", "anonymous"),
                    "name": getattr(self, "name", "Guest"),
                    "channel": self.channel_name,
                },
            )
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive_json(self, content, **kwargs):
        message_type = content.get("type")

        if message_type == "document.update":
            document = await self.save_document(
                title=content.get("title"),
                body=content.get("content", ""),
            )
            await self.channel_layer.group_send(
                self.group_name,
                {
                    "type": "document.changed",
                    "document": document,
                    "clientId": self.client_id,
                    "name": self.name,
                },
            )
            return

        if message_type == "cursor.move":
            await self.channel_layer.group_send(
                self.group_name,
                {
                    "type": "cursor.moved",
                    "clientId": self.client_id,
                    "name": self.name,
                    "selectionStart": content.get("selectionStart", 0),
                    "selectionEnd": content.get("selectionEnd", 0),
                },
            )

    async def document_changed(self, event):
        await self.send_json(
            {
                "type": "document.update",
                "document": event["document"],
                "clientId": event["clientId"],
                "name": event["name"],
            }
        )

    async def cursor_moved(self, event):
        if event["clientId"] == self.client_id:
            return
        await self.send_json(
            {
                "type": "cursor.move",
                "clientId": event["clientId"],
                "name": event["name"],
                "selectionStart": event["selectionStart"],
                "selectionEnd": event["selectionEnd"],
            }
        )

    async def presence_join(self, event):
        if event["channel"] == self.channel_name:
            return
        await self.send_json(
            {
                "type": "presence.join",
                "clientId": event["clientId"],
                "name": event["name"],
            }
        )

    async def presence_leave(self, event):
        if event["channel"] == self.channel_name:
            return
        await self.send_json(
            {
                "type": "presence.leave",
                "clientId": event["clientId"],
                "name": event["name"],
            }
        )

    @sync_to_async
    def get_document(self):
        try:
            return Document.objects.get(id=self.document_id)
        except Document.DoesNotExist:
            return None

    @sync_to_async
    def save_document(self, title, body):
        with transaction.atomic():
            document = Document.objects.select_for_update().get(id=self.document_id)
            if title is not None:
                document.title = title or "Untitled document"
            document.content = body
            document.revision += 1
            document.save(update_fields=["title", "content", "revision", "updated_at"])
            return document_to_dict(document)
