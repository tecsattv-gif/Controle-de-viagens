// Fotos e anexos guardados NO PRÓPRIO TELEFONE (sem servidor).
//
// Celular: a imagem escolhida (câmera/galeria) é copiada para a pasta privada
// do app (Paths.document/files) e o registro guarda o caminho "local/files/<id>.jpg".
// Web (pré-visualização): a imagem é guardada como data URI dentro do próprio registro.

import { Directory, File, Paths } from "expo-file-system";
import { Platform } from "react-native";

import { newId } from "@/src/local/db";

export const LOCAL_PREFIX = "local/";
const FILES_DIR = "files";

function filesDir(): Directory {
  const dir = new Directory(Paths.document, FILES_DIR);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

/** Arquivo local correspondente a um caminho "local/files/...". */
export function localFile(path: string): File {
  return new File(Paths.document, path.slice(LOCAL_PREFIX.length));
}

// URI para exibir um arquivo guardado.
export function fileUrl(path: string): string {
  if (!path) return "";
  if (path.startsWith("data:") || path.startsWith("http://") || path.startsWith("https://")) return path;
  if (path.startsWith("file:") || path.startsWith("content:")) return path;
  if (path.startsWith(LOCAL_PREFIX) && Platform.OS !== "web") {
    try {
      const f = localFile(path);
      return f.exists ? f.uri : "";
    } catch {
      return "";
    }
  }
  return "";
}

function extFrom(uri: string, nameHint?: string): string {
  const src = (nameHint || uri.split("?")[0]).toLowerCase();
  const m = src.match(/\.([a-z0-9]{2,5})$/);
  const ext = m ? m[1] : "jpg";
  return ["jpg", "jpeg", "png", "webp", "heic", "pdf"].includes(ext) ? ext : "jpg";
}

async function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Guarda uma imagem escolhida (câmera/galeria) e devolve o caminho a gravar no registro.
export async function uploadImage(uri: string, nameHint?: string): Promise<string> {
  if (Platform.OS === "web") {
    const blob = await (await fetch(uri)).blob();
    return blobToDataUri(blob);
  }
  const ext = extFrom(uri, nameHint);
  const name = `${newId()}.${ext}`;
  const dest = new File(filesDir(), name);
  await new File(uri).copy(dest);
  return `${LOCAL_PREFIX}${FILES_DIR}/${name}`;
}

const MIME: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", pdf: "application/pdf",
};

export function mimeFor(path: string): string {
  return MIME[extFrom(path)] || "application/octet-stream";
}

// Converte um arquivo guardado em data URI (usado no logo dos PDFs).
export async function toDataUri(pathOrUrl: string): Promise<string> {
  if (!pathOrUrl) return "";
  if (pathOrUrl.startsWith("data:")) return pathOrUrl;
  if (Platform.OS !== "web") {
    const f = pathOrUrl.startsWith(LOCAL_PREFIX)
      ? localFile(pathOrUrl)
      : pathOrUrl.startsWith("file:")
        ? new File(pathOrUrl)
        : null;
    if (f) {
      if (!f.exists) return "";
      return `data:${mimeFor(f.uri)};base64,${await f.base64()}`;
    }
  }
  const blob = await (await fetch(pathOrUrl)).blob();
  return blobToDataUri(blob);
}
