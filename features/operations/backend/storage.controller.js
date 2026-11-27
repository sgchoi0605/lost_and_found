// [D] 물품 보관·기한 점검·폐기·이관 HTTP 요청을 서비스로 전달하고 { data } 형식으로 응답합니다.

import {
  disposeStorageItem,
  getAdminStorageCandidates,
  getAdminStorageList,
  registerStorage,
  runRetentionCheck,
  updateStorageInfo,
} from './storage.service.js';

// 습득물을 보관 기록에 접수합니다.
export function create(req, res) {
  res.status(201).json({ data: registerStorage(req.db, req.user, req.body) });
}

// 관리자용 보관 물품 목록을 조회합니다.
export function listAdmin(req, res) {
  res.json({ data: getAdminStorageList(req.db, req.query) });
}

// 아직 보관 접수되지 않은 습득 신고 목록을 조회합니다.
export function listCandidates(req, res) {
  res.json({ data: getAdminStorageCandidates(req.db, req.query) });
}

// 보관 중인 물품의 보관 장소·기한을 수정합니다.
export function updateAdmin(req, res) {
  res.json({ data: updateStorageInfo(req.db, req.user, req.params.id, req.body) });
}

// 보관 물품을 폐기 또는 이관 처리합니다.
export function disposeAdmin(req, res) {
  res.json({ data: disposeStorageItem(req.db, req.user, req.params.id, req.body) });
}

// 보관 기한 임박·초과 점검과 EXPIRY 알림 발송을 실행합니다.
export function checkRetention(req, res) {
  res.json({ data: runRetentionCheck(req.db, req.user, req.body) });
}
