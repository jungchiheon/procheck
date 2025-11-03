'use client';

import React from 'react';
import { useAuth } from '@/lib/auth';
import { LS_KEYS, load, save, genId } from '@/lib/storage';
import { Megaphone, UploadCloud, Plus, ArrowUpDown, Pencil, Trash2, X } from 'lucide-react';

type Notice = {
  id: number;
  title: string;
  content: string;
  createdBy?: number | null;
  createdAt: string; // ISO
};

function Modal({
  open, onClose, title, children
}: { open: boolean; onClose: () => void; title?: string; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute left-1/2 top-1/2 w-[92vw] max-w-lg -translate-x-1/2 -translate-y-1/2">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden">
          <div className="px-4 py-3 border-b bg-slate-50 text-sm font-medium flex items-center justify-between">
            <div>{title}</div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100" aria-label="닫기">
              <X size={16} />
            </button>
          </div>
          <div className="p-4">{children}</div>
        </div>
      </div>
    </div>
  );
}

export default function NoticesClient() {
  const { user } = useAuth();
  const canWrite = user?.role === 'manager' || user?.role === 'super_admin';
  const canDelete = canWrite;

  // 목록/저장 & 마운트
  const [list, setList] = React.useState<Notice[]>(() => load<Notice[]>(LS_KEYS.notices) || []);
  const persist = (rows: Notice[]) => {
    save(LS_KEYS.notices, rows);
    setList(rows);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('notices:changed'));
    }
  };

  // 작성 모달
  const [writeOpen, setWriteOpen] = React.useState(false);
  const [title, setTitle] = React.useState('');
  const [content, setContent] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  // 상세 모달(여기서 수정/삭제 처리)
  const [detailOpen, setDetailOpen] = React.useState(false);
  const [detail, setDetail] = React.useState<Notice | null>(null);
  const [editing, setEditing] = React.useState(false);
  const [editTitle, setEditTitle] = React.useState('');
  const [editContent, setEditContent] = React.useState('');

  // 검색/정렬
  const [q, setQ] = React.useState('');
  const [order, setOrder] = React.useState<'desc'|'asc'>('desc');

  // 최초 정렬 로드
  React.useEffect(() => {
    const rows = (load<Notice[]>(LS_KEYS.notices) || []).slice().sort((a,b)=> (b.createdAt||'').localeCompare(a.createdAt||''));
    setList(rows);
  }, []);

  const openWrite = () => {
    if (!canWrite) return alert('공지 작성 권한이 없습니다.');
    setTitle(''); setContent(''); setWriteOpen(true);
  };
  const closeWrite = () => setWriteOpen(false);

  const onCreate = () => {
    if (!canWrite) return alert('공지 작성 권한이 없습니다.');
    if (!title.trim() || !content.trim()) return alert('제목/내용을 입력하세요.');
    setSubmitting(true);
    const row: Notice = {
      id: genId(),
      title: title.trim(),
      content: content.trim(),
      createdBy: user?.id || null,
      createdAt: new Date().toISOString()
    };
    const rows = [row, ...list].slice(0, 500);
    persist(rows);
    setSubmitting(false);
    closeWrite();
  };

  const openDetail = (n: Notice) => {
    setDetail(n);
    setEditing(false);
    setEditTitle(n.title);
    setEditContent(n.content);
    setDetailOpen(true);
  };
  const closeDetail = () => { setDetailOpen(false); setDetail(null); setEditing(false); };

  // 상세 모달 안에서 수정/삭제
  const startEdit = () => {
    if (!canWrite) return;
    setEditing(true);
    setEditTitle(detail?.title || '');
    setEditContent(detail?.content || '');
  };
  const cancelEdit = () => {
    setEditing(false);
    setEditTitle(detail?.title || '');
    setEditContent(detail?.content || '');
  };
  const saveEdit = () => {
    if (!canWrite || !detail) return;
    if (!editTitle.trim() || !editContent.trim()) return alert('제목/내용을 입력하세요.');
    const rows = list.map(n => n.id === detail.id ? { ...n, title: editTitle.trim(), content: editContent.trim() } : n);
    persist(rows);
    const updated = rows.find(n => n.id === detail.id) || null;
    setDetail(updated);
    setEditing(false);
  };
  const deleteDetail = () => {
    if (!canDelete || !detail) return;
    if (!confirm('삭제하시겠습니까?')) return;
    const rows = list.filter(n => n.id !== detail.id);
    persist(rows);
    closeDetail();
  };

  // 검색/정렬 적용
  const view = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    let rows = (list || []).filter(n => {
      if (!needle) return true;
      return (n.title||'').toLowerCase().includes(needle) || (n.content||'').toLowerCase().includes(needle);
    });
    rows = rows.slice().sort((a,b) => {
      const cmp = (a.createdAt||'').localeCompare(b.createdAt||'');
      return order === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [list, q, order]);

  return (
    <>
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Megaphone className="text-slate-700" />
          <h2 className="text-xl font-semibold">공지</h2>
        </div>

        {canWrite && (
          <button
            onClick={openWrite}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 hover:bg-slate-700 text-white text-sm font-medium px-4 py-2.5"
            title="새 공지"
          >
            <Plus size={16} />
            새 공지
          </button>
        )}
      </div>

      {/* 툴바: 검색 + 정렬 */}
      <div className="mb-3 flex items-center gap-2">
        <input
          value={q}
          onChange={e=>setQ(e.target.value)}
          placeholder="제목/내용 검색"
          className="flex-1 px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
        />
        <button
          onClick={()=>setOrder(o=> o==='desc' ? 'asc' : 'desc')}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-sm px-3 py-2"
          title="정렬 전환"
        >
          <ArrowUpDown size={16} />
          {order === 'desc' ? '최신순' : '오래된순'}
        </button>
      </div>

      {/* 모바일 리스트: 제목/시간/번호만 (깔끔) */}
      <div className="md:hidden bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {view.length === 0 ? (
          <div className="p-4 text-sm text-slate-500">등록된 공지가 없습니다.</div>
        ) : (
          <ul className="divide-y">
            {view.map((n, idx) => {
              const no = order === 'desc' ? (view.length - idx) : (idx + 1);
              return (
                <li key={n.id} className="px-4 py-3">
                  <button
                    onClick={() => openDetail(n)}
                    className="w-full text-left"
                    title="상세 보기"
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-medium text-slate-900 line-clamp-1">{n.title}</div>
                      <div className="text-xs text-slate-400 ml-3 shrink-0">No.{no}</div>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {new Date(n.createdAt).toLocaleString()}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* 데스크톱 테이블 (목록에서는 버튼 제거) */}
      <div className="hidden md:block bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="p-3 text-left w-[8%]">번호</th>
              <th className="p-3 text-left w-[52%]">제목</th>
              <th className="p-3 text-left w-[20%]">작성일</th>
            </tr>
          </thead>
          <tbody>
            {view.map((n, idx) => {
              const no = order === 'desc' ? (view.length - idx) : (idx + 1);
              return (
                <tr key={n.id} className="border-t">
                  <td className="p-3">No.{no}</td>
                  <td className="p-3">
                    <button
                      onClick={() => openDetail(n)}
                      className="text-slate-900 hover:underline underline-offset-2"
                      title="상세 보기"
                    >
                      {n.title}
                    </button>
                  </td>
                  <td className="p-3">{new Date(n.createdAt).toLocaleString()}</td>
                </tr>
              );
            })}
            {view.length === 0 && (
              <tr><td className="p-4 text-slate-500" colSpan={3}>등록된 공지가 없습니다.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 작성 모달 (관리자만) */}
      <Modal open={writeOpen} onClose={closeWrite} title="새 공지 작성">
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">제목</label>
            <input
              value={title}
              onChange={e=>setTitle(e.target.value)}
              placeholder="제목을 입력하세요"
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">내용</label>
            <textarea
              value={content}
              onChange={e=>setContent(e.target.value)}
              placeholder="내용을 입력하세요"
              rows={5}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200 resize-none"
            />
          </div>

          <div className="mt-4 flex justify-end">
            <button
              disabled={!canWrite || submitting || !title.trim() || !content.trim()}
              onClick={onCreate}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 hover:bg-slate-700 text-white text-sm font-medium px-4 py-2.5 disabled:opacity-60"
            >
              <UploadCloud size={16} />
              {submitting ? '업로드 중…' : '등록'}
            </button>
          </div>
        </div>
      </Modal>

      {/* 상세 모달 (여기서만 수정/삭제) */}
      <Modal open={detailOpen} onClose={closeDetail} title={editing ? '공지 수정' : '공지 상세'}>
        {!detail ? null : (
          <div className="space-y-3">
            {!editing ? (
              <>
                <div className="text-base font-semibold">{detail.title}</div>
                <div className="text-xs text-slate-400">{new Date(detail.createdAt).toLocaleString()}</div>
                <div className="pt-2 whitespace-pre-line text-slate-800">{detail.content}</div>

                <div className="pt-4 flex items-center justify-end gap-2">
                  {canWrite && (
                    <>
                      <button
                        onClick={startEdit}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 hover:bg-slate-700 text-white text-sm px-3 py-2"
                        title="수정"
                      >
                        <Pencil size={14} /> 수정
                      </button>
                      <button
                        onClick={deleteDetail}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm px-3 py-2"
                        title="삭제"
                      >
                        <Trash2 size={14} /> 삭제
                      </button>
                    </>
                  )}
                  <button
                    onClick={closeDetail}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-sm px-3 py-2"
                  >
                    닫기
                  </button>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">제목</label>
                  <input
                    value={editTitle}
                    onChange={e=>setEditTitle(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">내용</label>
                  <textarea
                    value={editContent}
                    onChange={e=>setEditContent(e.target.value)}
                    rows={5}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200 resize-none"
                  />
                </div>

                <div className="pt-2 flex items-center justify-end gap-2">
                  <button
                    onClick={cancelEdit}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-sm px-3 py-2"
                  >
                    취소
                  </button>
                  <button
                    onClick={saveEdit}
                    disabled={!editTitle.trim() || !editContent.trim()}
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-900 hover:bg-slate-700 text-white text-sm font-medium px-4 py-2.5 disabled:opacity-60"
                  >
                    <UploadCloud size={16} />
                    수정 완료
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}