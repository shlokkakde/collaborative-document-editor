import json

from django.test import TestCase
from django.urls import reverse

from .models import Document


class DocumentApiTests(TestCase):
    def test_create_and_list_document(self):
        response = self.client.post(
            reverse("documents-collection"),
            data=json.dumps({"title": "Sprint notes", "content": "Kickoff"}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)
        created = response.json()["document"]
        self.assertEqual(created["title"], "Sprint notes")

        response = self.client.get(reverse("documents-collection"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()["documents"]), 1)

    def test_update_document_increments_revision(self):
        document = Document.objects.create(title="Draft", content="First")

        response = self.client.patch(
            reverse("document-detail", args=[document.id]),
            data=json.dumps({"content": "Second"}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        updated = response.json()["document"]
        self.assertEqual(updated["content"], "Second")
        self.assertEqual(updated["revision"], 1)
