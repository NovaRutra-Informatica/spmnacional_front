export const MAX_ADMIN_UPLOAD_BYTES = 10 * 1024 * 1024;

export interface UploadedMedia {
    id: string;
    url: string;
    originalName: string;
    mimeType: string;
    size: number;
}

interface UploadResponse {
    ok: boolean;
    message?: string;
    media?: UploadedMedia;
}

export async function uploadAdminFile(
    file: File,
    purpose: 'biblioteca' | 'noticias',
): Promise<UploadedMedia> {
    if (file.size <= 0) throw new Error('O arquivo está vazio.');
    if (file.size > MAX_ADMIN_UPLOAD_BYTES) {
        throw new Error('Arquivo maior que o limite de 10 MB.');
    }

    const response = await fetch(`/api/admin/uploads?purpose=${purpose}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
            'Content-Type': 'application/octet-stream',
            'X-File-Name': encodeURIComponent(file.name),
        },
        body: file,
    });

    const result = (await response.json().catch(() => null)) as UploadResponse | null;
    if (!response.ok || !result?.ok || !result.media) {
        throw new Error(result?.message || 'Não foi possível enviar o arquivo.');
    }

    return result.media;
}
