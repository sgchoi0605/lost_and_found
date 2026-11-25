// [B] 신고 사진의 형식·크기를 검사하고 로컬 업로드 폴더에 저장·조회합니다.

import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpError } from '../../../shared/backend/error.middleware.js';

const ROOT_DIR = fileURLToPath(new URL('../../../', import.meta.url));
const PHOTO_URL_PREFIX = '/api/reports/photos/';
const DATA_URL_PATTERN = /^data:(image\/jpeg|image\/png);base64,([A-Za-z0-9+/=]+)$/;
const SAFE_FILE_NAME = /^[a-f0-9]{24}\.(jpg|png)$/;

export const MAX_PHOTOS = 3;
export const MAX_PHOTO_BYTES = 60 * 1024;
export const MAX_TOTAL_PHOTO_BYTES = 65 * 1024;

// 업로드 폴더 경로를 반환합니다. 테스트에서는 환경 변수로 임시 폴더를 지정합니다.
export function getUploadDir() {
  return process.env.REPORT_UPLOAD_DIR || resolve(ROOT_DIR, 'uploads', 'reports');
}

// JPEG·PNG 파일의 실제 시그니처(매직 바이트)가 MIME 타입과 일치하는지 확인합니다.
function hasValidSignature(buffer, mimeType) {
  if (mimeType === 'image/jpeg') {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimeType === 'image/png') {
    return (
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    );
  }
  return false;
}

// 이미 저장된 내부 경로인지 안전하게 검사합니다. 외부 URL과 상위 경로 이동은 거부합니다.
function isSafeInternalPhotoPath(value) {
  return (
    value.startsWith('/') &&
    !value.startsWith('//') &&
    value.length <= 300 &&
    !value.includes('..') &&
    !/[\\\u0000-\u0020]/.test(value)
  );
}

// DB 저장이 실패했을 때 미리 저장한 사진 파일을 정리합니다.
export function cleanupSavedPhotos(savedFiles = []) {
  for (const filePath of savedFiles) {
    try {
      unlinkSync(filePath);
    } catch {
      // 이미 삭제된 파일은 무시합니다.
    }
  }
}

// 사진 배열을 검증하고 Data URL 이미지는 파일로 저장해 같은 출처 URL 목록으로 바꿉니다.
export function preparePhotos(photosInput) {
  if (photosInput === undefined || photosInput === null) {
    return { photoUrls: [], savedFiles: [] };
  }
  if (!Array.isArray(photosInput)) {
    throw new HttpError(400, 'VALIDATION_ERROR', '사진 목록은 배열 형식이어야 합니다.');
  }
  if (photosInput.length > MAX_PHOTOS) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `사진은 최대 ${MAX_PHOTOS}장까지 등록할 수 있습니다.`,
    );
  }

  const photoUrls = [];
  const savedFiles = [];
  let totalBytes = 0;

  try {
    for (const item of photosInput) {
      if (typeof item !== 'string' || !item.trim()) {
        throw new HttpError(400, 'VALIDATION_ERROR', '올바른 사진 데이터를 보내주세요.');
      }
      const value = item.trim();

      if (value.startsWith('data:')) {
        const match = value.match(DATA_URL_PATTERN);
        if (!match) {
          throw new HttpError(400, 'VALIDATION_ERROR', 'JPG 또는 PNG 형식의 사진만 업로드할 수 있습니다.');
        }

        const [, mimeType, base64Data] = match;
        const buffer = Buffer.from(base64Data, 'base64');
        if (buffer.length === 0 || !hasValidSignature(buffer, mimeType)) {
          throw new HttpError(400, 'VALIDATION_ERROR', '손상되었거나 지원하지 않는 이미지 파일입니다.');
        }
        if (buffer.length > MAX_PHOTO_BYTES) {
          throw new HttpError(400, 'VALIDATION_ERROR', '사진 한 장의 크기가 허용 용량을 초과했습니다.');
        }

        totalBytes += buffer.length;
        if (totalBytes > MAX_TOTAL_PHOTO_BYTES) {
          throw new HttpError(400, 'VALIDATION_ERROR', '전체 사진 크기가 허용 용량을 초과했습니다.');
        }

        const ext = mimeType === 'image/png' ? 'png' : 'jpg';
        const fileName = `${randomBytes(12).toString('hex')}.${ext}`;
        const uploadDir = getUploadDir();
        mkdirSync(uploadDir, { recursive: true });

        const filePath = join(uploadDir, fileName);
        writeFileSync(filePath, buffer);
        savedFiles.push(filePath);
        photoUrls.push(`${PHOTO_URL_PREFIX}${fileName}`);
        continue;
      }

      if (!isSafeInternalPhotoPath(value)) {
        throw new HttpError(400, 'VALIDATION_ERROR', '허용되지 않는 사진 경로입니다.');
      }
      photoUrls.push(value);
    }
  } catch (error) {
    cleanupSavedPhotos(savedFiles);
    throw error;
  }

  return { photoUrls, savedFiles };
}

// 저장된 사진 파일을 파일명 검증 후 읽어 응답용 버퍼와 MIME 타입을 반환합니다.
export function readUploadedPhoto(fileName) {
  if (typeof fileName !== 'string' || !SAFE_FILE_NAME.test(fileName)) {
    throw new HttpError(404, 'PHOTO_NOT_FOUND', '사진을 찾을 수 없습니다.');
  }

  const filePath = join(getUploadDir(), fileName);
  try {
    const buffer = readFileSync(filePath);
    return {
      buffer,
      contentType: fileName.endsWith('.png') ? 'image/png' : 'image/jpeg',
    };
  } catch {
    throw new HttpError(404, 'PHOTO_NOT_FOUND', '사진을 찾을 수 없습니다.');
  }
}
