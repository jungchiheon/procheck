'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseClient } from '@/lib/supabaseClient'
import { GlassCard } from '@/components/ui/GlassCard'
import { PageHeader } from '@/components/ui/PageHeader'
import { ProButton } from '@/components/ui/ProButton'
import { cn } from '@/lib/cn'

export default function AdminLostNewPage() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [file, setFile] = useState<File | null>(null)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      const { data: u } = await supabaseClient.auth.getUser()
      if (!u.user) router.replace('/login')
    })()
  }, [router])

  const onSave = async () => {
    setError(null)
    setSaving(true)
    try {
      const t = title.trim()
      const c = content.trim()
      if (!t) throw new Error('제목을 입력하세요.')
      if (!c) throw new Error('내용을 입력하세요.')

      const { data: u } = await supabaseClient.auth.getUser()
      const uid = u.user?.id
      if (!uid) throw new Error('세션이 없습니다. 다시 로그인 해주세요.')

      let image_path: string | null = null
      let image_url: string | null = null

      if (file) {
        const safeName = file.name.replace(/\s+/g, '_')
        image_path = `lost/${uid}/${Date.now()}-${safeName}`

        const { error: upErr } = await supabaseClient.storage
          .from('lostfound')
          .upload(image_path, file, { upsert: false })

        if (upErr) throw new Error(`사진 업로드 실패: ${upErr.message}`)

        const { data: urlData } = supabaseClient.storage.from('lostfound').getPublicUrl(image_path)
        image_url = urlData.publicUrl
      }

      const { error: insErr } = await supabaseClient.from('lost_posts').insert({
        title: t,
        content: c,
        image_path,
        image_url,
        created_by: uid,
      })

      if (insErr) throw new Error(insErr.message)

      router.replace('/admin/lost')
    } catch (e: any) {
      setError(e?.message ?? '오류')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="분실물 글쓰기" backHref="/admin/lost" />

      <GlassCard className="p-6 space-y-4">
        <div>
          <label className="text-sm font-medium text-white/80">제목</label>
          <input
            className="mt-2 w-full rounded-xl border border-white/12 bg-black/20 px-3 py-2.5 text-white outline-none placeholder:text-white/30 focus:border-white/25"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: 검정 지갑 분실"
            autoComplete="off"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-white/80">내용</label>
          <textarea
            className="mt-2 h-40 w-full resize-none rounded-xl border border-white/12 bg-black/20 px-3 py-2.5 text-white outline-none placeholder:text-white/30 focus:border-white/25"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="내용을 입력하세요..."
          />
        </div>

        <div>
          <label className="text-sm font-medium text-white/80">사진(선택)</label>
          <input
            type="file"
            accept="image/*"
            className="mt-2 w-full text-sm text-white/70"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <div className="mt-1 text-xs text-white/40">목록에서는 사진이 보이지 않습니다.</div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <ProButton variant="ghost" className="flex-1" onClick={() => router.back()} type="button">
            취소
          </ProButton>
          <ProButton className={cn('flex-1')} onClick={onSave} disabled={saving} type="button">
            {saving ? '저장 중...' : '저장'}
          </ProButton>
        </div>
      </GlassCard>
    </div>
  )
}
