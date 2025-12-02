"use client";

import AIReadinessInteractive from '@/components/AIReadinessInteractive'
import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect } from 'react'

function SharePointEmbed() {
  const searchParams = useSearchParams()
  
  const hideHeader = searchParams.get('hideHeader') === 'true'
  const hideFooter = searchParams.get('hideFooter') === 'true'
  const compact = searchParams.get('compact') === 'true'

  // Notify SharePoint/parent that the app is ready
  useEffect(() => {
    // Signal to parent that embed is loaded
    if (window.parent !== window) {
      window.parent.postMessage({ 
        type: 'AI_READINESS_READY',
        source: 'ai-readiness-dashboard'
      }, '*');
    }

    // Handle resize messages from parent
    const handleMessage = (event) => {
      if (event.data?.type === 'RESIZE') {
        document.body.style.height = event.data.height || '100vh';
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return (
    <div 
      style={{ 
        padding: compact ? 8 : 0, 
        margin: 0,
        minHeight: '100vh',
        background: '#f8fafc',
        overflow: 'auto'
      }}
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

export default function SharePointPage() {
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
      <SharePointEmbed />
    </Suspense>
  )
}

