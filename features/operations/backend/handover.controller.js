// [D] 인계 신청 HTTP 요청을 서비스로 전달하고 공통 { data } 형식으로 응답합니다.

import {
  completeHandoverRequest,
  createHandoverRequest,
  getAdminHandoverDetail,
  getAdminHandovers,
  getMyHandovers,
  reviewHandoverRequest,
} from './handover.service.js';

// 습득물 인계 신청을 등록합니다.
export function create(req, res) {
  res.status(201).json({ data: createHandoverRequest(req.db, req.user, req.body) });
}

// 로그인 사용자의 본인 인계 신청 목록을 조회합니다.
export function listMine(req, res) {
  res.json({ data: getMyHandovers(req.db, req.user, req.query) });
}

// 관리자용 전체 인계 신청 목록을 조회합니다.
export function listAdmin(req, res) {
  res.json({ data: getAdminHandovers(req.db, req.query) });
}

// 관리자용 인계 신청 상세 정보를 조회합니다.
export function getAdminOne(req, res) {
  res.json({ data: getAdminHandoverDetail(req.db, req.params.id) });
}

// 관리자가 인계 신청을 검토 중·승인·거절로 변경합니다.
export function updateAdminStatus(req, res) {
  res.json({ data: reviewHandoverRequest(req.db, req.user, req.params.id, req.body) });
}

// 관리자가 승인된 인계 신청을 실물 인계 완료 처리합니다.
export function completeAdmin(req, res) {
  res.json({ data: completeHandoverRequest(req.db, req.user, req.params.id, req.body) });
}
