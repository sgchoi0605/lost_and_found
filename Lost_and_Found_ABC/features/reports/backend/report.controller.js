// [B] 분실·습득 신고 HTTP 요청을 서비스로 전달하고 공통 { data } 형식으로 응답합니다.

import { readUploadedPhoto } from './photo-upload.js';
import {
  changeAdminReportStatus,
  createReport,
  deleteAdminReport,
  deleteMyReport,
  editMyReport,
  getAdminReports,
  getMyReports,
  getReportForEdit,
} from './report.service.js';

// 분실·습득 신고를 등록합니다.
export function create(req, res) {
  res.status(201).json({ data: createReport(req.db, req.user, req.body) });
}

// 로그인 사용자의 본인 신고 목록을 조회합니다.
export function listMine(req, res) {
  res.json({ data: getMyReports(req.db, req.user, req.query) });
}

// 수정 화면에서 사용할 신고 단건 정보를 조회합니다.
export function getOne(req, res) {
  res.json({ data: getReportForEdit(req.db, req.user, req.params.id) });
}

// 본인 신고 내용을 수정합니다.
export function updateMine(req, res) {
  res.json({ data: editMyReport(req.db, req.user, req.params.id, req.body) });
}

// 본인 신고를 삭제합니다.
export function removeMine(req, res) {
  res.json({ data: deleteMyReport(req.db, req.user, req.params.id) });
}

// 관리자용 전체 신고 목록을 조회합니다.
export function listAdmin(req, res) {
  res.json({ data: getAdminReports(req.db, req.query) });
}

// 관리자가 신고 진행 상태를 변경합니다.
export function updateAdminStatus(req, res) {
  res.json({ data: changeAdminReportStatus(req.db, req.user, req.params.id, req.body) });
}

// 관리자가 신고를 삭제합니다.
export function removeAdmin(req, res) {
  res.json({ data: deleteAdminReport(req.db, req.user, req.params.id) });
}

// 업로드된 신고 사진을 이미지 응답으로 제공합니다.
export function getPhoto(req, res) {
  const { buffer, contentType } = readUploadedPhoto(req.params.fileName);
  res.set('Content-Type', contentType);
  res.set('X-Content-Type-Options', 'nosniff');
  res.send(buffer);
}
