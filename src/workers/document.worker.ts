import { extractDoc, extractDocx } from '../import/word';
import { DocumentError, type ImportReply } from '../import/format';

const scope = self as unknown as {
  onmessage: (event: MessageEvent<{ file: File; kind: 'doc' | 'docx' }>) => void;
  postMessage: (reply: ImportReply) => void;
};
scope.onmessage = async ({ data }) => {
  try {
    const bytes = new Uint8Array(await data.file.arrayBuffer());
    const text = data.kind === 'doc' ? extractDoc(bytes) : extractDocx(bytes);
    scope.postMessage({ text });
  } catch (error) {
    scope.postMessage({ error: error instanceof DocumentError ? error.code : 'invalid' });
  }
};
