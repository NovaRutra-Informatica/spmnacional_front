-- Indexes follow the actual equality filters and stable ordering of list queries.
CREATE INDEX "Post_status_publishedAt_id_idx" ON "Post"("status", "publishedAt", "id");
CREATE INDEX "Post_categoryId_status_publishedAt_id_idx" ON "Post"("categoryId", "status", "publishedAt", "id");
CREATE INDEX "Post_status_highlight_publishedAt_id_idx" ON "Post"("status", "highlight", "publishedAt", "id");
DROP INDEX "Post_status_publishedAt_idx";
CREATE INDEX "AgendaEvent_calendarId_source_endsAt_idx" ON "AgendaEvent"("calendarId", "source", "endsAt");
CREATE INDEX "ContactMessage_assignedToId_createdAt_id_idx" ON "ContactMessage"("assignedToId", "createdAt", "id");
CREATE INDEX "Atendimento_regionalId_abertoEm_id_idx" ON "Atendimento"("regionalId", "abertoEm", "id");
