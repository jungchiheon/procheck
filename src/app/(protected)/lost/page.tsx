'use client';

import React from 'react';
import ClientGuard from '@/middleware/client-guard';
import PageWrap from '@/components/PageWrap';
import { useAuth } from '@/lib/auth';
import { PackageSearch, UploadCloud, Image as ImgIcon, Trash2 } from 'lucide-react';

type Item = {
  id: string;
  title: string;
  content: string;
  image_url?: string | null;
  created_by?: number | null;
  created_at?: string;
};

export default function LostPage() {
  // 1-2 상태
  const { user } = useAuth();
  const [list, setList] = React.useState<Item[]>([]);
  const [title, setTitle] = React.useState('');
  const [content, setContent] = React.useState('');
  const [file, setFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const canDelete = user?.role === 'manager' || user?.role === 'super_admin';

  // 1-3 목록 로드
  const loadList = React.useCallback(async () => {
    const res = await fetch('/api/lost?limit=200');
    const json = await res.json();
    setList(json?.rows || []);
  }, []);

  React.useEffect(() => { loadList(); }, [loadList]);

  // 1-4 파일 선택/미리보기
  const onPick = (f: File | null) => {
    setFile(f);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(f ? URL.createObjectURL(f) : null);
  };

  React.useEffect(() => {
    return () => { if (preview) URL.revokeObjectURL(preview); };
  }, [preview]);

  // 1-5 드래그&드롭
  const onDrop: React.DragEventHandler<HTMLLabelElement> = (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) onPick(f);
  };
  const onDragOver: React.DragEventHandler<HTMLLabelElement> = (e) => {
    e.preventDefault();
  };

  // 1-6 등록
  const onCreate = async () => {
    if (!title.trim() || !content.trim()) return alert('제목/내용을 입력하세요.');
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('title', title.trim());
      fd.append('content', content.trim());
      fd.append('userId', String(user?.id || ''));
      if (file) fd.append('file', file);

      const res = await fetch('/api/lost', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || '등록 실패');

      setTitle(''); setContent('');
      onPick(null);
      await loadList();
    } catch (e:any) {
      alert(e.message || '등록 실패');
    } finally {
      setLoading(false);
    }
  };

  // 1-7 삭제
  const onDelete = async (id: string) => {
    if (!confirm('삭제하시겠습니까?')) return;
    const res = await fetch(`/api/lost/${id}`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role: user?.role })
    });
    const json = await res.json();
    if (!res.ok) return alert(json?.error || '삭제 실패');
    await loadList();
  };

  return (
    <ClientGuard>
      <PageWrap>
        {/* 2-1 페이지 타이틀 */}
        <div className="flex items-center gap-2 mb-4">
          <PackageSearch className="text-slate-700" />
          <h2 className="text-xl font-semibold">분실물 게시판</h2>
        </div>

        {/* 2-2 작성 폼 (통일된 톤 & 컴팩트) */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-6">
          {/* 제목/내용 */}
          <div className="grid sm:grid-cols-3 gap-3">
            <input
              value={title}
              onChange={e=>setTitle(e.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
              placeholder="제목"
            />
            <input
              value={content}
              onChange={e=>setContent(e.target.value)}
              className="sm:col-span-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
              placeholder="내용"
            />
          </div>

          {/* 업로드 박스 */}
          <div className="mt-4 grid sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label
                onDrop={onDrop}
                onDragOver={onDragOver}
                className="group flex items-center gap-3 w-full cursor-pointer rounded-xl border border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 transition px-4 py-3"
                title="클릭하여 파일 선택 또는 끌어다 놓기"
              >
                <input
                  type="file"
                  accept="image/*"
                  onChange={e=>onPick(e.target.files?.[0] || null)}
                  className="hidden"
                />
                <UploadCloud size={18} className="text-slate-500 group-hover:text-slate-700" />
                <div className="text-sm text-slate-600">
                  <span className="font-medium text-slate-800">이미지 업로드</span>
                  <span className="ml-2 text-slate-500">PNG, JPG, WEBP (선택)</span>
                </div>
              </label>
              {/* 파일명 */}
              <div className="mt-2 text-xs text-slate-500 h-5">
                {file ? <span>선택됨: <span className="text-slate-700">{file.name}</span></span> : <span>선택된 파일 없음</span>}
              </div>
            </div>

            {/* 미리보기 카드 */}
            <div className="h-[120px] rounded-xl border border-slate-200 bg-white overflow-hidden flex items-center justify-center">
              {preview
                ? <img src={preview} alt="미리보기" className="w-full h-full object-cover" />
                : (
                  <div className="flex flex-col items-center text-slate-400 text-sm">
                    <ImgIcon size={20} />
                    <span className="mt-1">미리보기</span>
                  </div>
                )
              }
            </div>
          </div>

          {/* 등록 버튼 */}
          <div className="mt-4 flex justify-end">
            <button
              disabled={loading}
              onClick={onCreate}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 hover:bg-slate-700 text-white text-sm font-medium px-4 py-2.5 disabled:opacity-60"
            >
              <UploadCloud size={16} />
              {loading ? '업로드 중…' : '등록'}
            </button>
          </div>
        </div>

        {/* 2-3 목록 카드 (톤 통일: 라운드+소프트 보더/섀도우) */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map(it => (
            <div
              key={it.id}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-soft transition overflow-hidden"
            >
              <div className="w-full h-40 bg-slate-100">
                {it.image_url
                  ? <img src={it.image_url} alt={it.title} className="w-full h-full object-cover" />
                  : (
                    <div className="w-full h-full flex items-center justify-center text-slate-400 text-sm">
                      <ImgIcon className="mr-1" size={18} /> 이미지 없음
                    </div>
                  )
                }
              </div>
              <div className="p-4">
                <div className="font-medium truncate">{it.title}</div>
                <div className="text-sm text-slate-600 line-clamp-2">{it.content}</div>
                <div className="mt-1 text-[11px] text-slate-400">{it.created_at ? new Date(it.created_at).toLocaleString() : ''}</div>
                {canDelete && (
                  <div className="mt-3 flex justify-end">
                    <button
                      onClick={()=>onDelete(it.id)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs"
                      title="삭제"
                    >
                      <Trash2 size={14} />
                      삭제
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* 2-4 빈 상태 */}
        {list.length === 0 && (
          <div className="mt-6 text-slate-500 flex items-center gap-2">
            <PackageSearch size={18} />
            아직 등록된 분실물이 없습니다.
          </div>
        )}
      </PageWrap>
    </ClientGuard>
  );
}