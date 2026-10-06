# PostgreSQL 18.6 da HML: manter binários, entrypoint, PGDATA e layout oficiais.
# A imagem original inclui gosu compilado com Go antigo. O entrypoint só usa
# "gosu postgres comando args"; su-exec oferece a mesma troca de UID/GID+exec.
# https://github.com/ncopa/su-exec
FROM postgres:18.6-alpine@sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873

LABEL org.spmnacional.postgres-version="18.6"
LABEL org.spmnacional.postgres-base="sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873"

RUN apk add --no-cache --upgrade 'nghttp2-libs>=1.70.0-r0' su-exec \
    && rm -f /usr/local/bin/gosu

# A remoção em camada própria também registra o whiteout do binário antigo.
RUN ln -s /sbin/su-exec /usr/local/bin/gosu
