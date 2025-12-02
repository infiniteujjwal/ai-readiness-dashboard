"use client";

import AIReadinessInteractive from '@/components/AIReadinessInteractive'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function EmbedContent() {
  const searchParams = useSearchParams()
  
  // Optional: Get customization params from URL
  const hideHeader = searchParams.get('hideHeader') === 'true'
  const hideFooter = searchParams.get('hideFooter') === 'true'
  const compact = searchParams.get('compact') === 'true'
  
  return (
    <div 
      style={{ 
        padding: 0, 
        margin: 0,
        minHeight: '100vh',
        background: '#f8fafc'
      }}
      data-embed="true"
      data-hide-header={hideHeader}
      data-hide-footer={hideFooter}
      data-compact={compact}
    >
      <AIReadinessInteractive 
        isEmbedded={true}
        hideHeader={hideHeader}
        hideFooter={hideFooter}
        compact={compact}
      />
    </div>
  )
}

export default function EmbedPage() {
  return (
    <Suspense fallback={
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        height: '100vh',
        background: '#f8fafc'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ 
            width: 40, 
            height: 40, 
            border: '3px solid #e2e8f0',
            borderTopColor: '#3b82f6',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 16px'
          }} />
          <p style={{ color: '#64748b' }}>Loading Dashboard...</p>
        </div>
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    }>
      <EmbedContent />
    </Suspense>
  )
}

