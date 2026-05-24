import json

from django.http import JsonResponse
from django.http import HttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from .models import Document
from .serializers import document_to_dict


def read_json_body(request):
    if not request.body:
        return {}
    return json.loads(request.body.decode("utf-8"))


@csrf_exempt
@require_http_methods(["GET", "POST"])
def documents_collection(request):
    if request.method == "GET":
        documents = [document_to_dict(document) for document in Document.objects.all()]
        return JsonResponse({"documents": documents})

    payload = read_json_body(request)
    document = Document.objects.create(
        title=payload.get("title") or "Untitled document",
        content=payload.get("content") or "",
    )
    return JsonResponse({"document": document_to_dict(document)}, status=201)


@csrf_exempt
@require_http_methods(["GET", "PATCH", "PUT", "DELETE"])
def document_detail(request, document_id):
    try:
        document = Document.objects.get(id=document_id)
    except Document.DoesNotExist:
        return JsonResponse({"error": "Document not found."}, status=404)

    if request.method == "GET":
        return JsonResponse({"document": document_to_dict(document)})

    if request.method == "DELETE":
        document.delete()
        return HttpResponse(status=204)

    payload = read_json_body(request)
    changed = False

    if "title" in payload:
        document.title = payload["title"] or "Untitled document"
        changed = True

    if "content" in payload:
        document.content = payload["content"]
        changed = True

    if changed:
        document.revision += 1
        document.save(update_fields=["title", "content", "revision", "updated_at"])

    return JsonResponse({"document": document_to_dict(document)})
