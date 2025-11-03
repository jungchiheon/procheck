// 2-1 PWA 설정 포함 Next.js 설정
const withPWA = require('next-pwa')({
  // 2-2 서비스워커 출력 디렉토리
  dest: 'public',
  // 2-3 개발 모드에서 PWA 비활성화(원하면 true로 바꿔 상시 활성)
  disable: process.env.NODE_ENV === 'development',
  // 2-4 캐시 전략 기본값 (필요시 runtimeCaching 커스터마이징)
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  // 2-5 App Router 사용 기본
  reactStrictMode: true,
  experimental: {
    typedRoutes: true
  }
};

module.exports = withPWA(nextConfig);
