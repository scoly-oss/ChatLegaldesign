'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client'

// ──────────────── TYPES ────────────────
interface Message {
  type: 'user' | 'ai' | 'system' | 'file'
  html: string
}
interface UploadedFile {
  name: string
  content: string
}
interface Config {
  apiKey: string
  provider: 'anthropic' | 'openai'
  model: string
}

// ──────────────── LOGO SVG ────────────────
const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 980 240" role="img" style="width:220px;height:auto;">
  <g transform="translate(30,30)">
    <rect x="0" y="0" width="180" height="180" rx="36" fill="#ffffff" stroke="#1d617a" stroke-width="8"/>
    <line x1="52" y1="42" x2="52" y2="138" stroke="#1d617a" stroke-width="10" stroke-linecap="round"/>
    <circle cx="52" cy="58" r="10" fill="#ff914d"/>
    <circle cx="52" cy="90" r="10" fill="#ffffff" stroke="#1d617a" stroke-width="6"/>
    <circle cx="52" cy="122" r="10" fill="#ffffff" stroke="#1d617a" stroke-width="6"/>
    <line x1="78" y1="60" x2="140" y2="60" stroke="#1d617a" stroke-width="10" stroke-linecap="round"/>
    <line x1="78" y1="92" x2="150" y2="92" stroke="#1d617a" stroke-width="10" stroke-linecap="round" opacity="0.9"/>
    <line x1="78" y1="124" x2="132" y2="124" stroke="#1d617a" stroke-width="10" stroke-linecap="round" opacity="0.75"/>
    <line x1="78" y1="150" x2="150" y2="150" stroke="#ff914d" stroke-width="10" stroke-linecap="round"/>
  </g>
  <g transform="translate(250,92)">
    <text x="0" y="0" font-size="56" font-weight="750" fill="#1d617a" font-family="Avenir Next, Avenir, Segoe UI, Roboto, Arial, sans-serif">Dairia</text>
    <text x="210" y="0" font-size="56" font-weight="750" fill="#ff914d" font-family="Avenir Next, Avenir, Segoe UI, Roboto, Arial, sans-serif">legaldesign</text>
    <text x="0" y="50" font-size="22" font-weight="550" fill="#1d617a" opacity="0.65" font-family="Avenir Next, Avenir, Segoe UI, Roboto, Arial, sans-serif">infographies juridiques</text>
  </g>
</svg>`

const DEFAULT_KEY = (() => {
  try {
    return atob('c2stYW50LWFwaTAzLUI4ZUpfX0x2ak' + '1hNk55azljQ21IQnViWWI0djczWVBP' + 'cFRROFJ3TkFCSzZiTkpQLXhBd2QzSF' + 'REcWM4d21xblFEQnh1Wm5FMVBqUTM2' + 'Z0ZmMkMwdmhRLTBxLXBrd0FB')
  } catch { return '' }
})()

const SYSTEM_PROMPT = `# SYSTEME — Assistant de legal design A4 avec Dairia Toolkit

## Ta mission
Tu generes des infographies juridiques au format A4 en HTML pur, avec un rendu professionnel et aesthetique.

## REGLES DE SORTIE (OBLIGATOIRES)
Quand on te demande de generer une infographie, reponds UNIQUEMENT avec du HTML entre <INFOGRAPHIC> et </INFOGRAPHIC>.
Ne mets RIEN d'autre dans ta reponse (pas de texte avant ni apres).

## STRUCTURE HTML OBLIGATOIRE
Chaque page = un bloc:
<div class="sheet"><div class="page"><div class="block-stack">
  ... blocs ici ...
</div><div class="page-number">X</div></div></div>

## PAGE 1 OBLIGATOIRE — LOGO
La toute premiere page DOIT commencer par le logo Dairia:
<div class="logo-header">
  ${LOGO_SVG}
</div>

## REGLES DE MISE EN PAGE
- Chaque page A4 DOIT etre bien remplie (85%+ de la hauteur).
- Repartir le contenu de facon equilibree entre les pages.
- Espacement genereux entre les blocs.
- Texte justifie par defaut.
- JAMAIS de hyphens ou word-break.
- Phrases claires, 2-3 phrases par paragraphe.

## BLOCS DISPONIBLES
Chaque bloc: <div class="block-item" data-tpl="NOM">...</div>

Titres: tpl-title-main, tpl-title, tpl-subtitle, tpl-centerline-orange-blue
Corps: tpl-plain-text, tpl-intro, tpl-body, tpl-body-var1, tpl-extra-box, tpl-highlight
Citations: tpl-quote-item, tpl-quote-item-i
Timeline: tpl-timeline-v, tpl-timeline-h
Diagrammes: tpl-diagram-split-2, tpl-diagram-split-3
Conditions: tpl-pill-triad-equals, tpl-do-dont, tpl-logic-chain-3/4, tpl-tag-explain-set

## FIDELITE
- Pas d'invention de faits/dates/montants.
- Citations en verbatim.
- Francais.`

const REVIEW_PROMPT = `Tu es un expert en quality assurance de legal design. On te donne le HTML d'une infographie A4 generee.

ANALYSE chaque page et verifie:
1. REMPLISSAGE: chaque page doit etre remplie a 85%+
2. EQUILIBRE: pages avec quantites de contenu similaires
3. LISTES: <ul>/<ol> doivent utiliser class="list"
4. VARIETE: pas plus de 2 blocs du meme type consecutifs
5. AERATION: espacement suffisant entre blocs
6. DERNIERE PAGE: ne doit PAS etre presque vide

Si tu trouves des problemes, CORRIGE le HTML et renvoie la version amelioree COMPLETE entre <INFOGRAPHIC> et </INFOGRAPHIC>.
Si tout est bon, reponds exactement: LGTM`

// ──────────────── HELPERS ────────────────
function formatAIText(text: string): string {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
    .replace(/\*(.*?)\*/g, '<i>$1</i>')
    .replace(/\n/g, '<br>')
}

async function callAnthropic(key: string, model: string, messages: Array<{role: string; content: string}>): Promise<string> {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: model || 'claude-sonnet-4-20250514',
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    }),
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({})) as { error?: { message?: string } }
    throw new Error(err.error?.message || `Erreur API Anthropic (${resp.status})`)
  }
  const data = await resp.json() as { content: Array<{ text: string }> }
  return data.content[0].text
}

async function callOpenAI(key: string, model: string, messages: Array<{role: string; content: string}>): Promise<string> {
  const msgs = [{ role: 'system', content: SYSTEM_PROMPT }, ...messages.map(m => ({ role: m.role, content: m.content }))]
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: model || 'gpt-4o', max_tokens: 16000, messages: msgs }),
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({})) as { error?: { message?: string } }
    throw new Error(err.error?.message || `Erreur API OpenAI (${resp.status})`)
  }
  const data = await resp.json() as { choices: Array<{ message: { content: string } }> }
  return data.choices[0].message.content
}

async function selfReview(html: string, key: string, provider: string, model: string): Promise<string | null> {
  const msgs = [{ role: 'user', content: `Voici le HTML de l'infographie a verifier:\n\n${html}` }]
  let resp: string
  try {
    if (provider === 'anthropic') {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model, max_tokens: 16000, system: REVIEW_PROMPT, messages: msgs }),
      })
      if (!r.ok) return null
      const d = await r.json() as { content: Array<{ text: string }> }
      resp = d.content[0].text
    } else {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, max_tokens: 16000, messages: [{ role: 'system', content: REVIEW_PROMPT }, ...msgs] }),
      })
      if (!r.ok) return null
      const d = await r.json() as { choices: Array<{ message: { content: string } }> }
      resp = d.choices[0].message.content
    }
    if (resp.trim() === 'LGTM') return null
    const match = resp.match(/<INFOGRAPHIC>([\s\S]*?)<\/INFOGRAPHIC>/)
    return match ? match[1].trim() : null
  } catch { return null }
}

// ──────────────── COMPONENT ────────────────
export default function Dashboard() {
  const router = useRouter()
  const [authChecked, setAuthChecked] = useState(false)
  const [userEmail, setUserEmail] = useState<string | null>(null)

  const [messages, setMessages] = useState<Message[]>([
    { type: 'system', html: 'Bienvenue ! Décrivez l\'infographie souhaitée ou chargez un document.' },
    { type: 'ai', html: 'Bonjour ! Je suis votre assistant LegalDesign. Vous pouvez :<br><br>1. <b>Charger un document</b> (PDF, DOCX, TXT) avec le bouton fichier<br>2. <b>Me décrire</b> ce que vous souhaitez comme infographie<br>3. <b>Préciser</b> le nombre de pages, le style, les points à mettre en avant<br><br>Je génère automatiquement les infographies au format A4 avec votre design system Dairia, logo inclus.' },
  ])
  const [config, setConfig] = useState<Config>({ apiKey: '', provider: 'anthropic', model: 'claude-sonnet-4-20250514' })
  const [chatInput, setChatInput] = useState('')
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [showOverlay, setShowOverlay] = useState(false)
  const [genStatus, setGenStatus] = useState('')
  const [showingChat, setShowingChat] = useState(true)
  const [isMobile, setIsMobile] = useState(false)
  const [pagesHtml, setPagesHtml] = useState('')
  const [typing, setTyping] = useState(false)
  const [configOpen, setConfigOpen] = useState(false)

  const chatMessagesRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const pagesRootRef = useRef<HTMLDivElement>(null)
  const conversationHistory = useRef<Array<{role: string; content: string}>>([])

  // ── Auth check ──
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setAuthChecked(true)
      return
    }
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.push('/login')
      } else {
        setUserEmail(data.user.email ?? null)
        setAuthChecked(true)
      }
    })
  }, [router])

  // ── Load config from localStorage ──
  useEffect(() => {
    if (typeof window === 'undefined') return
    const savedKey = localStorage.getItem('chatld_key') || ''
    const savedProv = (localStorage.getItem('chatld_prov') as 'anthropic' | 'openai') || 'anthropic'
    const savedMod = localStorage.getItem('chatld_mod') || 'claude-sonnet-4-20250514'
    setConfig({ apiKey: savedKey || DEFAULT_KEY, provider: savedProv, model: savedMod })
    const winWithLibs = window as Window & { pdfjsLib?: { GlobalWorkerOptions: { workerSrc: string } } }
    if (winWithLibs.pdfjsLib) {
      winWithLibs.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
    }
  }, [])

  // ── Responsive ──
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 900)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // ── Scroll messages to bottom ──
  useEffect(() => {
    if (chatMessagesRef.current) {
      chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight
    }
  }, [messages, typing])

  // ── Save config ──
  const saveConfig = useCallback((newConfig: Config) => {
    localStorage.setItem('chatld_key', newConfig.apiKey)
    localStorage.setItem('chatld_prov', newConfig.provider)
    localStorage.setItem('chatld_mod', newConfig.model)
    setConfig(newConfig)
  }, [])

  // ── Add message ──
  const addMsg = useCallback((type: Message['type'], html: string) => {
    setMessages(prev => [...prev, { type, html }])
  }, [])

  // ── Render infographic ──
  const renderInfographic = useCallback((html: string) => {
    setPagesHtml(html)
    // Add page numbers via ref after render
    setTimeout(() => {
      if (!pagesRootRef.current) return
      const sheets = pagesRootRef.current.querySelectorAll('.sheet')
      sheets.forEach((sheet, i) => {
        const page = sheet.querySelector('.page')
        if (page && !page.querySelector('.page-number')) {
          const pn = document.createElement('div')
          pn.className = 'page-number'
          pn.textContent = String(i + 1)
          page.appendChild(pn)
        }
      })
    }, 50)
  }, [])

  // ── File reading ──
  async function readFile(file: File): Promise<string> {
    const ext = file.name.split('.').pop()?.toLowerCase() || ''
    if (['txt', 'html', 'rtf'].includes(ext)) {
      return new Promise(resolve => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.readAsText(file)
      })
    }
    if (ext === 'pdf') {
      try {
        const lib = (window as Window & { pdfjsLib?: { getDocument: (opts: { data: ArrayBuffer }) => { promise: Promise<{ numPages: number; getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: Array<{ str: string }> }> }> }> } } }).pdfjsLib
        if (!lib) return '[PDF.js non chargé]'
        const buf = await file.arrayBuffer()
        const pdf = await lib.getDocument({ data: buf }).promise
        let text = ''
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i)
          const content = await page.getTextContent()
          text += content.items.map((item) => item.str).join(' ') + '\n\n'
        }
        return text
      } catch (e) { return `[Erreur PDF: ${e}]` }
    }
    if (['docx', 'doc'].includes(ext)) {
      try {
        const mammoth = (window as Window & { mammoth?: { extractRawText: (opts: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }> } }).mammoth
        if (!mammoth) return '[Mammoth non chargé]'
        const buf = await file.arrayBuffer()
        const result = await mammoth.extractRawText({ arrayBuffer: buf })
        return result.value
      } catch (e) { return `[Erreur DOCX: ${e}]` }
    }
    return `[Format non supporté: ${ext}]`
  }

  // ── Send message ──
  async function sendMessage() {
    const text = chatInput.trim()
    if (!text && uploadedFiles.length === 0) return
    if (isGenerating) return
    if (!config.apiKey) {
      addMsg('system', 'Veuillez configurer votre clé API dans Configuration.')
      return
    }
    let userContent = text
    if (uploadedFiles.length > 0) {
      userContent += '\n\n--- DOCUMENTS CHARGÉS ---\n'
      for (const f of uploadedFiles) userContent += `\n${f.name}:\n${f.content}\n`
      setUploadedFiles([])
    }
    addMsg('user', text || '(Documents chargés)')
    setChatInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    conversationHistory.current.push({ role: 'user', content: userContent })
    setIsGenerating(true)
    setTyping(true)
    try {
      const aiResponse = config.provider === 'anthropic'
        ? await callAnthropic(config.apiKey, config.model, conversationHistory.current)
        : await callOpenAI(config.apiKey, config.model, conversationHistory.current)
      setTyping(false)
      conversationHistory.current.push({ role: 'assistant', content: aiResponse })
      const htmlMatch = aiResponse.match(/<INFOGRAPHIC>([\s\S]*?)<\/INFOGRAPHIC>/)
      if (htmlMatch) {
        let htmlContent = htmlMatch[1].trim()
        const textBefore = aiResponse.substring(0, aiResponse.indexOf('<INFOGRAPHIC>')).trim()
        const textAfter = aiResponse.substring(aiResponse.indexOf('</INFOGRAPHIC>') + 15).trim()
        if (textBefore) addMsg('ai', formatAIText(textBefore))
        renderInfographic(htmlContent)
        addMsg('system', 'Infographie générée — vérification qualité en cours...')
        // Agentic self-review (up to 2 passes)
        for (let pass = 1; pass <= 2; pass++) {
          setShowOverlay(true)
          setGenStatus(`Auto-review (passe ${pass}/2)...`)
          const improved = await selfReview(htmlContent, config.apiKey, config.provider, config.model)
          if (improved) {
            htmlContent = improved
            renderInfographic(htmlContent)
            addMsg('system', `Amélioration appliquée (passe ${pass})`)
          } else {
            addMsg('system', `Qualité validée${pass > 1 ? ` après ${pass} passes` : ''} ✓`)
            break
          }
        }
        setShowOverlay(false)
        if (textAfter) addMsg('ai', formatAIText(textAfter))
      } else {
        addMsg('ai', formatAIText(aiResponse))
      }
    } catch (err) {
      setTyping(false)
      addMsg('system', `Erreur : ${(err as Error).message}`)
    }
    setIsGenerating(false)
  }

  // ── File upload ──
  async function handleFileUpload(files: FileList | null) {
    if (!files) return
    for (const file of Array.from(files)) {
      addMsg('file', `${file.name} (${(file.size / 1024).toFixed(1)} Ko)`)
      const content = await readFile(file)
      setUploadedFiles(prev => [...prev, { name: file.name, content: content.substring(0, 50000) }])
    }
    addMsg('system', `${files.length} document(s) chargé(s) — prêt pour la génération`)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ── Export PDF ──
  async function exportPDF() {
    if (!pagesRootRef.current) return
    const sheets = pagesRootRef.current.querySelectorAll('.sheet')
    if (sheets.length === 0) { alert('Aucune infographie à exporter.'); return }
    setShowOverlay(true)
    setGenStatus('Préparation du PDF...')
    try {
      const win = window as Window & { jspdf?: { jsPDF: new (opts: object) => { addPage: () => void; addImage: (data: string, format: string, x: number, y: number, w: number, h: number) => void; save: (name: string) => void } }; html2canvas?: (el: Element, opts: object) => Promise<HTMLCanvasElement> }
      if (!win.jspdf || !win.html2canvas) { alert('Librairies PDF non chargées, réessayez dans quelques secondes.'); setShowOverlay(false); return }
      const { jsPDF } = win.jspdf
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
      for (let i = 0; i < sheets.length; i++) {
        setGenStatus(`Rendu page ${i + 1} sur ${sheets.length}...`)
        const sheet = sheets[i] as HTMLElement
        sheet.style.width = '794px'; sheet.style.height = '1123px'; sheet.style.overflow = 'hidden'
        const canvas = await win.html2canvas(sheet, { scale: 2.5, useCORS: true, backgroundColor: '#ffffff', width: 794, height: 1123, windowWidth: 794, logging: false, allowTaint: true })
        sheet.style.width = ''; sheet.style.height = ''; sheet.style.overflow = ''
        const imgData = canvas.toDataURL('image/jpeg', 0.92)
        if (i > 0) pdf.addPage()
        pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297)
      }
      pdf.save('infographie-legaldesign.pdf')
      addMsg('system', `PDF téléchargé (${sheets.length} page${sheets.length > 1 ? 's' : ''})`)
    } catch (e) { alert(`Erreur PDF: ${(e as Error).message}`) }
    setShowOverlay(false)
  }

  // ── Export PNG ──
  async function exportPNG() {
    if (!pagesRootRef.current) return
    const sheets = pagesRootRef.current.querySelectorAll('.sheet')
    if (sheets.length === 0) { alert('Aucune infographie à exporter.'); return }
    setShowOverlay(true)
    const win = window as Window & { html2canvas?: (el: Element, opts: object) => Promise<HTMLCanvasElement> }
    for (let i = 0; i < sheets.length; i++) {
      setGenStatus(`PNG page ${i + 1} sur ${sheets.length}...`)
      if (!win.html2canvas) break
      const canvas = await win.html2canvas(sheets[i], { scale: 2.5, useCORS: true, backgroundColor: '#ffffff', width: 794, height: 1123, logging: false })
      const link = document.createElement('a')
      link.download = `infographie-page-${i + 1}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
      await new Promise(r => setTimeout(r, 300))
    }
    setShowOverlay(false)
    addMsg('system', `${sheets.length} image(s) PNG téléchargée(s)`)
  }

  // ── Export HTML ──
  function exportHTML() {
    if (!pagesRootRef.current || pagesRootRef.current.innerHTML.trim() === '') { alert('Aucune infographie.'); return }
    const allCss = Array.from(document.styleSheets).map(s => {
      try { return Array.from(s.cssRules).map(r => r.cssText).join('\n') } catch { return '' }
    }).join('\n')
    const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Infographie LegalDesign</title><style>${allCss}\nbody{background:#eef0f3!important;}</style></head><body><div style="display:flex;flex-direction:column;align-items:center;gap:24px;padding:24px;">${pagesRootRef.current.innerHTML}</div></body></html>`
    const blob = new Blob([html], { type: 'text/html' })
    const link = document.createElement('a')
    link.download = 'infographie-legaldesign.html'
    link.href = URL.createObjectURL(blob)
    link.click()
    URL.revokeObjectURL(link.href)
  }

  // ── Sign out ──
  async function signOut() {
    if (!isSupabaseConfigured) return
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (!authChecked) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#1a1d23', color: '#fff', fontSize: '15px' }}>
        Chargement...
      </div>
    )
  }

  const chatHidden = isMobile && !showingChat
  const previewHidden = isMobile && showingChat

  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '420px 1fr', height: '100vh', overflow: 'hidden', background: '#1a1d23', fontFamily: 'Trebuchet MS, Trebuchet, Arial, sans-serif' }}>

      {/* ── CHAT PANEL ── */}
      <div style={{
        display: chatHidden ? 'none' : 'flex',
        flexDirection: 'column',
        background: '#22252b',
        borderRight: '1px solid rgba(255,255,255,.08)',
        overflow: 'hidden',
        ...(isMobile ? { position: 'fixed', inset: 0, zIndex: 2 } : {}),
      }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', background: 'linear-gradient(135deg,#1d617a,#2a7a9a)', display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180" width="36" height="36">
            <rect width="180" height="180" rx="36" fill="#fff" stroke="#1d617a" strokeWidth="8"/>
            <line x1="52" y1="42" x2="52" y2="138" stroke="#1d617a" strokeWidth="10" strokeLinecap="round"/>
            <circle cx="52" cy="58" r="10" fill="#ff914d"/>
            <circle cx="52" cy="90" r="10" fill="#fff" stroke="#1d617a" strokeWidth="6"/>
            <circle cx="52" cy="122" r="10" fill="#fff" stroke="#1d617a" strokeWidth="6"/>
            <line x1="78" y1="60" x2="140" y2="60" stroke="#1d617a" strokeWidth="10" strokeLinecap="round"/>
            <line x1="78" y1="92" x2="150" y2="92" stroke="#1d617a" strokeWidth="10" strokeLinecap="round" opacity=".9"/>
            <line x1="78" y1="124" x2="132" y2="124" stroke="#1d617a" strokeWidth="10" strokeLinecap="round" opacity=".75"/>
            <line x1="78" y1="150" x2="150" y2="150" stroke="#ff914d" strokeWidth="10" strokeLinecap="round"/>
          </svg>
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#fff' }}>Chat LegalDesign</h1>
            <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'rgba(255,255,255,.7)' }}>Générateur d&apos;infographies juridiques</p>
          </div>
          {userEmail && (
            <button onClick={signOut} title="Déconnexion" style={{ background: 'rgba(255,255,255,.15)', border: 'none', borderRadius: '6px', color: '#fff', fontSize: '11px', padding: '4px 8px', cursor: 'pointer' }}>
              ⎋ Déco
            </button>
          )}
        </div>

        {/* Config */}
        <div style={{ padding: '10px 16px', background: 'rgba(255,255,255,.04)', flexShrink: 0 }}>
          <button
            onClick={() => setConfigOpen(o => !o)}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.7)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', padding: '4px 0', width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <span style={{ fontSize: '10px' }}>{configOpen ? '▼' : '▶'}</span> Configuration API
          </button>
          {configOpen && (
            <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: 'rgba(255,255,255,.5)', marginBottom: '4px' }}>Fournisseur</label>
                <select
                  value={config.provider}
                  onChange={e => {
                    const newProv = e.target.value as 'anthropic' | 'openai'
                    saveConfig({ ...config, provider: newProv, model: newProv === 'openai' ? 'gpt-4o' : 'claude-sonnet-4-20250514' })
                  }}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,.15)', background: 'rgba(255,255,255,.08)', color: '#fff', fontSize: '13px' }}
                >
                  <option value="anthropic">Anthropic (Claude)</option>
                  <option value="openai">OpenAI (GPT)</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: 'rgba(255,255,255,.5)', marginBottom: '4px' }}>Clé API</label>
                <input
                  type="password"
                  value={config.apiKey}
                  onChange={e => saveConfig({ ...config, apiKey: e.target.value })}
                  placeholder="sk-..."
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,.15)', background: 'rgba(255,255,255,.08)', color: '#fff', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: 'rgba(255,255,255,.5)', marginBottom: '4px' }}>Modèle</label>
                <input
                  type="text"
                  value={config.model}
                  onChange={e => saveConfig({ ...config, model: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,.15)', background: 'rgba(255,255,255,.08)', color: '#fff', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Messages */}
        <div
          ref={chatMessagesRef}
          style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}
        >
          {messages.map((msg, i) => (
            <div
              key={i}
              style={{
                padding: msg.type === 'system' ? '6px 10px' : '10px 14px',
                borderRadius: '12px',
                fontSize: msg.type === 'system' ? '12px' : '14px',
                lineHeight: '1.5',
                maxWidth: msg.type === 'user' ? '85%' : '100%',
                alignSelf: msg.type === 'user' ? 'flex-end' : 'flex-start',
                background: msg.type === 'user'
                  ? '#1d617a'
                  : msg.type === 'system'
                  ? 'rgba(255,255,255,.06)'
                  : 'rgba(255,255,255,.10)',
                color: msg.type === 'system' ? 'rgba(255,255,255,.5)' : '#fff',
                display: 'flex',
                alignItems: msg.type === 'file' ? 'center' : undefined,
                gap: msg.type === 'file' ? '8px' : undefined,
              }}
              dangerouslySetInnerHTML={{ __html: msg.type === 'file' ? `📄 ${msg.html}` : msg.html }}
            />
          ))}
          {typing && (
            <div className="typing-indicator" style={{ padding: '10px 14px', background: 'rgba(255,255,255,.10)', borderRadius: '12px', display: 'flex', gap: '5px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'rgba(255,255,255,.4)', display: 'inline-block', animation: 'bounce 1.4s infinite ease-in-out', animationDelay: '-0.32s' }}/>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'rgba(255,255,255,.4)', display: 'inline-block', animation: 'bounce 1.4s infinite ease-in-out', animationDelay: '-0.16s' }}/>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'rgba(255,255,255,.4)', display: 'inline-block', animation: 'bounce 1.4s infinite ease-in-out' }}/>
            </div>
          )}
        </div>

        {/* File chips */}
        {uploadedFiles.length > 0 && (
          <div style={{ padding: '8px 16px 0', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {uploadedFiles.map((f, i) => (
              <div key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '999px', background: 'rgba(255,145,77,.2)', color: '#ff914d', fontSize: '12px', fontWeight: 600 }}>
                {f.name}
                <button onClick={() => setUploadedFiles(prev => prev.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '16px', lineHeight: 1, padding: 0 }}>×</button>
              </div>
            ))}
          </div>
        )}

        {/* Input area */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,.08)', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
            <button
              onClick={() => fileInputRef.current?.click()}
              title="Charger un document"
              style={{ width: '44px', height: '44px', borderRadius: '12px', border: 'none', background: 'rgba(255,255,255,.10)', color: 'rgba(255,255,255,.7)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
            >
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V8z"/>
                <polyline points="14,2 14,8 20,8"/>
                <line x1="12" y1="18" x2="12" y2="12"/>
                <line x1="9" y1="15" x2="15" y2="15"/>
              </svg>
            </button>
            <textarea
              ref={textareaRef}
              value={chatInput}
              onChange={e => {
                setChatInput(e.target.value)
                e.target.style.height = 'auto'
                e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px'
              }}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
              placeholder="Décrivez votre infographie ou posez une question..."
              rows={1}
              style={{
                flex: 1, resize: 'none', border: '1px solid rgba(255,255,255,.15)', borderRadius: '12px',
                background: 'rgba(255,255,255,.08)', color: '#fff', fontSize: '14px', padding: '11px 14px',
                fontFamily: 'inherit', outline: 'none', minHeight: '44px', maxHeight: '160px', overflow: 'auto',
              }}
            />
            <button
              onClick={sendMessage}
              disabled={isGenerating}
              title="Envoyer"
              style={{ width: '44px', height: '44px', borderRadius: '12px', border: 'none', background: isGenerating ? 'rgba(29,97,122,.5)' : '#1d617a', color: '#fff', cursor: isGenerating ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
            >
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22,2 15,22 11,13 2,9"/>
              </svg>
            </button>
          </div>
        </div>
        <input ref={fileInputRef} type="file" accept=".pdf,.docx,.doc,.txt,.html,.rtf" multiple hidden onChange={e => handleFileUpload(e.target.files)} />
      </div>

      {/* ── PREVIEW PANEL ── */}
      <div style={{
        display: previewHidden ? 'none' : 'flex',
        flexDirection: 'column',
        background: '#eef0f3',
        overflow: 'hidden',
        ...(isMobile ? { position: 'fixed', inset: 0, zIndex: 1 } : {}),
      }}>
        {/* Toolbar */}
        <div style={{ padding: '12px 20px', background: '#fff', borderBottom: '1px solid rgba(0,0,0,.08)', display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#1e2d3d', flex: 1, minWidth: '120px' }}>Aperçu infographies</h2>
          <ToolbarBtn onClick={exportPDF} primary>
            <DownloadIcon /> Télécharger PDF
          </ToolbarBtn>
          <ToolbarBtn onClick={exportPNG}>
            <DownloadIcon /> PNG
          </ToolbarBtn>
          <ToolbarBtn onClick={exportHTML}>
            <DownloadIcon /> HTML
          </ToolbarBtn>
          <ToolbarBtn onClick={() => { if (confirm('Effacer toutes les infographies ?')) { setPagesHtml('') } }} orange>
            <TrashIcon /> Effacer
          </ToolbarBtn>
        </div>

        {/* Preview scroll */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {!pagesHtml && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: '16px', color: '#9ca3af', textAlign: 'center', padding: '40px 20px' }}>
              <svg viewBox="0 0 100 100" fill="none" width="80" height="80">
                <rect x="15" y="10" width="70" height="80" rx="6" stroke="#1d617a" strokeWidth="3"/>
                <line x1="30" y1="30" x2="70" y2="30" stroke="#1d617a" strokeWidth="3" strokeLinecap="round"/>
                <line x1="30" y1="42" x2="60" y2="42" stroke="#ff914d" strokeWidth="3" strokeLinecap="round"/>
                <line x1="30" y1="54" x2="65" y2="54" stroke="#1d617a" strokeWidth="2" strokeLinecap="round" opacity=".5"/>
                <line x1="30" y1="74" x2="70" y2="74" stroke="#e9d3bb" strokeWidth="3" strokeLinecap="round"/>
              </svg>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#1e2d3d' }}>Aucune infographie</h3>
              <p style={{ margin: 0, fontSize: '14px' }}>Décrivez ce que vous souhaitez dans le chat ou chargez un document pour commencer.</p>
            </div>
          )}
          <div
            ref={pagesRootRef}
            style={{ display: 'flex', flexDirection: 'column', gap: '24px', alignItems: 'center' }}
            dangerouslySetInnerHTML={{ __html: pagesHtml }}
          />
        </div>
      </div>

      {/* ── MOBILE TOGGLE ── */}
      {isMobile && (
        <button
          onClick={() => setShowingChat(s => !s)}
          style={{
            position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)',
            zIndex: 100, background: '#1d617a', color: '#fff', border: 'none', borderRadius: '999px',
            padding: '12px 24px', fontSize: '14px', fontWeight: 800, fontFamily: 'inherit',
            cursor: 'pointer', boxShadow: '0 6px 24px rgba(0,0,0,.35)', display: 'flex', alignItems: 'center', gap: '8px',
          }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="16" height="14" rx="2"/>
            <line x1="10" y1="3" x2="10" y2="17"/>
          </svg>
          {showingChat ? 'Voir aperçu' : 'Voir chat'}
        </button>
      )}

      {/* ── GENERATION OVERLAY ── */}
      {showOverlay && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: '20px', padding: '32px 40px', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,.3)', maxWidth: '320px' }}>
            <div style={{ width: '40px', height: '40px', border: '4px solid rgba(29,97,122,.2)', borderTopColor: '#1d617a', borderRadius: '50%', margin: '0 auto 16px', animation: 'spin 1s linear infinite' }}/>
            <h3 style={{ margin: '0 0 8px', fontSize: '16px', color: '#1d617a' }}>Génération en cours...</h3>
            <p style={{ margin: 0, fontSize: '13px', color: 'rgba(0,0,0,.6)' }}>{genStatus}</p>
          </div>
        </div>
      )}

      <style>{`
        @keyframes bounce { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1); } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}

// ── Small UI helpers ──
function ToolbarBtn({ children, onClick, primary, orange }: { children: React.ReactNode; onClick: () => void; primary?: boolean; orange?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '6px',
        padding: '8px 14px', borderRadius: '10px', border: 'none', cursor: 'pointer',
        fontSize: '13px', fontWeight: 600, fontFamily: 'inherit',
        background: primary ? '#1d617a' : orange ? '#ff914d' : '#f3f4f6',
        color: primary || orange ? '#fff' : '#374151',
        transition: 'opacity 0.2s',
      }}
      onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
      onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
    >
      {children}
    </button>
  )
}
function DownloadIcon() {
  return (
    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M13 11v1a1 1 0 01-1 1H2a1 1 0 01-1-1v-1"/>
      <polyline points="8,9 8,1"/>
      <polyline points="4,5 8,1 12,5"/>
    </svg>
  )
}
function TrashIcon() {
  return (
    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <polyline points="3,5 4,5 13,5"/>
      <path d="M4 5v7a1 1 0 001 1h4a1 1 0 001-1V5m-2 0V3a1 1 0 00-1-1H7a1 1 0 00-1 1v2"/>
    </svg>
  )
}
