from django.contrib import admin

from .models import Document


@admin.register(Document)
class DocumentAdmin(admin.ModelAdmin):
    list_display = ("title", "revision", "updated_at", "created_at")
    search_fields = ("title", "content")
    readonly_fields = ("id", "created_at", "updated_at")
