from django.urls import path

from . import views

urlpatterns = [
    path("documents/", views.documents_collection, name="documents-collection"),
    path("documents/<uuid:document_id>/", views.document_detail, name="document-detail"),
]
