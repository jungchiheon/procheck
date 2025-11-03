ProCheck Button System v3 적용 방법

1) 압축을 프로젝트 루트에 풀고 파일 덮어쓰기
   - src/components/ui/Button.tsx (신규)
   - src/components/TopNav.tsx
   - src/app/(protected)/attendance/page.tsx
   - src/app/(protected)/schedule/page.tsx
   - src/app/(protected)/calls/page.tsx
   - src/app/(protected)/debts/page.tsx
   - src/app/(protected)/users/page.tsx

2) 의존성 설치 (없다면)
   npm install clsx

3) 개발 서버 재시작
   rmdir /s /q .next
   npm run dev

버튼 변형:
- variant: 'solid' | 'brand' | 'outline' | 'ghost' | 'danger' | 'success'
- size: 'sm' | 'md'
- leftIcon/rightIcon 지원 (lucide-react)
