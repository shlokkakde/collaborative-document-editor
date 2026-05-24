def document_to_dict(document):
    return {
        "id": str(document.id),
        "title": document.title,
        "content": document.content,
        "revision": document.revision,
        "createdAt": document.created_at.isoformat(),
        "updatedAt": document.updated_at.isoformat(),
    }
