-- O bucket deixa de ser público. Todos os arquivos passam pela rota da
-- aplicação, que autoriza rascunhos e só libera conteúdo publicado.
UPDATE "Media"
SET "url" = '/api/arquivos/' || "storageKey"
WHERE "url" <> '/api/arquivos/' || "storageKey";

UPDATE "Post" AS post
SET "coverUrl" = media."url"
FROM "Media" AS media
WHERE post."coverMediaId" = media."id";

UPDATE "Edital" AS edital
SET "fileUrl" = media."url"
FROM "Media" AS media
WHERE edital."fileMediaId" = media."id";

UPDATE "Documento" AS documento
SET "fileUrl" = media."url"
FROM "Media" AS media
WHERE documento."mediaId" = media."id";

UPDATE "SemanaMaterial" AS material
SET "fileUrl" = media."url"
FROM "Media" AS media
WHERE material."mediaId" = media."id";
