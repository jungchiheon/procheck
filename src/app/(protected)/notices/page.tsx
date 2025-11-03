'use client';

import ClientGuard from '@/middleware/client-guard';
import PageWrap from '@/components/PageWrap';
import NoticesClient from './NoticesClient';

export default function NoticesPage() {
  return (
    <ClientGuard>
      <PageWrap>
        <NoticesClient />
      </PageWrap>
    </ClientGuard>
  );
}