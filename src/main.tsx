import { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { EmailAuthProvider, browserLocalPersistence, createUserWithEmailAndPassword, linkWithCredential, onAuthStateChanged, sendPasswordResetEmail, setPersistence, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth'
import { cloudRepository, repository } from './data'
import { dataMode, firebaseAuth, firebaseConfigured } from './firebase'
import type { AppData, Attendance, Availability, Match, MatchEvent, Player, Position, Session, TeamProfile } from './types'
import './styles.css'
import './callups.css'
import './auth.css'
import './stats.css'

type View = 'accueil'|'effectif'|'présences'|'matchs'|'tactique'|'stats'
const positions: Position[] = ['GB','DD','DC','DG','MDC','MC','MOC','AD','AG','BU']
const teamCategories = ['U6','U7','U8','U9','U10','U11','U12','U13','U14','U15','U16','U17','U18','U19','Seniors','Loisirs']
const seasonStart = new Date().getMonth() >= 6 ? new Date().getFullYear() : new Date().getFullYear() - 1
const seasonOptions = Array.from({length: 5}, (_, index) => {
  const year = seasonStart - 2 + index
  return `${year}–${String(year + 1).slice(-2)}`
})
const currentSeason = `${seasonStart}–${String(seasonStart + 1).slice(-2)}`
const formSlots = (formation: Match['formation']) => formation === '4-4-2'
  ? ['GB','DD','DC1','DC2','DG','MD1','MD2','AD','AG','BU1','BU2']
  : ['GB','DD','DC1','DC2','DG','MDC1','MDC2','AD','MOC','AG','BU']
const labelSlot = (s:string) => {
  const base = s.replace(/\d/g, '')
  return base === 'MD' ? 'MC' : base
}
const initials = (p: Player) => `${p.firstName[0]}${p.lastName[0]}`
const fullName = (p?: Player) => p ? `${p.firstName} ${p.lastName}` : '—'
const uid = () => crypto.randomUUID()

function App() {
  const [user, setUser] = useState<User | null | undefined>(firebaseConfigured ? undefined : null)
  useEffect(() => {
    if (!firebaseAuth) return
    return onAuthStateChanged(firebaseAuth, setUser)
  }, [])
  if (!firebaseConfigured) return <CoachApp user={null}/>
  if (user === undefined) return <LoadingScreen/>
  if (!user) return <AuthScreen/>
  if (user.isAnonymous) return <ClaimAccountScreen user={user}/>
  return <CoachApp key={user.uid} user={user}/>
}

function CoachApp({user}:{user:User|null}) {
  const storageScope = user?.uid || 'demo'
  const [data, setData] = useState<AppData>(() => repository.load(storageScope))
  const [view, setView] = useState<View>('accueil')
  const [sheet, setSheet] = useState<'player'|'session'|'match'|'report'|'player-stats'|null>(null)
  const [activeSession, setActiveSession] = useState<string>(() => data.sessions[0]?.id || '')
  const [activeMatch, setActiveMatch] = useState<string>(() => data.matches[0]?.id || '')
  const [editPlayer, setEditPlayer] = useState<Player | undefined>()
  const [statsPlayer, setStatsPlayer] = useState<Player | undefined>()
  const [toast, setToast] = useState('')
  const update = (fn: (current: AppData) => AppData) => setData(current => {
    const next = fn(current)
    repository.save(next, storageScope)
    if (firebaseConfigured) cloudRepository.save(next).catch(() => notify('Sauvegarde Firebase impossible'))
    return next
  })
  const notify = (message:string) => { setToast(message); window.setTimeout(()=>setToast(''), 2200) }
  useEffect(()=>{
    if (!firebaseConfigured) return
    let unsubscribe: (() => void) | undefined
    cloudRepository.subscribe(
      next => { repository.save(next, storageScope); setData(next) },
      () => notify('Connexion Firebase indisponible'),
    ).then(stop => { unsubscribe = stop })
    return () => unsubscribe?.()
  }, [storageScope])
  useEffect(()=>{ if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(()=>undefined) },[])
  const activePlayers = data.players.filter(p=>p.active)
  const match = data.matches.find(m=>m.id===activeMatch)
  if (firebaseConfigured && !data.team?.onboardingCompleted) return <Onboarding email={user?.email || ''} onComplete={team=>update(d=>({...d,team}))}/>
  return <main className="app-shell">
    <header className="topbar"><div className="brand-mark">CB</div><div><p className="eyebrow">{data.team?.category || 'U18'} · SAISON {data.team?.season || '2026–27'}</p><h1>{data.team?.name || 'CoachBoard'}</h1></div><button className="avatar" title={user?.email ? `Se déconnecter (${user.email})` : 'Réglages'} aria-label="Se déconnecter" onClick={()=>{if (firebaseAuth && window.confirm('Se déconnecter de CoachBoard ?')) signOut(firebaseAuth).catch(()=>notify('Déconnexion impossible'))}}>{user?.email?.slice(0,1).toUpperCase() || 'MB'}</button></header>
    <section className="content">
      {view==='accueil' && <Dashboard data={data} go={setView} setMatch={setActiveMatch} />}
      {view==='effectif' && <Roster players={activePlayers} onAdd={()=>{setEditPlayer(undefined);setSheet('player')}} onEdit={p=>{setEditPlayer(p);setSheet('player')}} update={update} />}
      {view==='présences' && <AttendanceView data={data} selected={activeSession} setSelected={setActiveSession} newSession={()=>setSheet('session')} update={update} />}
      {view==='matchs' && <MatchesView data={data} activeMatch={activeMatch} setActiveMatch={id=>{setActiveMatch(id);setView('tactique')}} newMatch={()=>setSheet('match')} />}
      {view==='tactique' && match && <Tactics match={match} players={activePlayers} update={update} report={()=>setSheet('report')} />}
      {view==='stats' && <Stats data={data} onOpenPlayer={player=>{setStatsPlayer(player);setSheet('player-stats')}} />}
    </section>
    <nav className="bottom-nav" aria-label="Navigation principale">
      {([['accueil','⌂','Accueil'],['effectif','♙','Effectif'],['présences','✓','Présences'],['matchs','◉','Matchs'],['stats','▥','Stats']] as [View,string,string][]).map(([id,icon,label])=><button key={id} className={view===id?'active':''} onClick={()=>setView(id)}><span>{icon}</span>{label}</button>)}
    </nav>
    {toast && <div className="toast">{toast}</div>}
    {sheet==='player' && <PlayerSheet player={editPlayer} onClose={()=>setSheet(null)} onSave={player=>{update(d=>({...d,players: editPlayer ? d.players.map(p=>p.id===player.id?player:p) : [...d.players,player]}));setSheet(null);notify(editPlayer?'Joueur mis à jour':'Joueur ajouté')}} />}
    {sheet==='session' && <SessionSheet onClose={()=>setSheet(null)} onSave={session=>{update(d=>({...d,sessions:[session,...d.sessions]}));setActiveSession(session.id);setSheet(null);notify('Séance créée')}} />}
    {sheet==='match' && <MatchSheet players={activePlayers} onClose={()=>setSheet(null)} onSave={newMatch=>{update(d=>({...d,matches:[newMatch,...d.matches]}));setActiveMatch(newMatch.id);setSheet(null);setView('tactique');notify('Match créé : préparez votre composition')}} />}
    {sheet==='report' && match && <ReportSheet match={match} players={activePlayers} onClose={()=>setSheet(null)} onSave={updated=>{update(d=>({...d,matches:d.matches.map(m=>m.id===updated.id?updated:m)}));setSheet(null);notify('Après-match enregistré')}} />}
    {sheet==='player-stats' && statsPlayer && <PlayerStatsSheet player={statsPlayer} data={data} onClose={()=>setSheet(null)} />}
    {dataMode==='demo' && <div className="demo-badge" title="Les données sont enregistrées dans ce navigateur">Mode démo</div>}
    {!firebaseConfigured && <button className="reset-demo" onClick={()=>{if(confirm('Réinitialiser toutes les données de démonstration ?')) {setData(repository.reset());notify('Données réinitialisées')}}}>↻</button>}
  </main>
}

function LoadingScreen() { return <main className="auth-shell"><div className="auth-card"><div className="brand-mark">CB</div><p className="eyebrow">COACHBOARD</p><h1>Connexion sécurisée…</h1></div></main> }

function AuthScreen() {
  const [mode,setMode] = useState<'login'|'register'>('login')
  const [email,setEmail] = useState('')
  const [password,setPassword] = useState('')
  const [confirmation,setConfirmation] = useState('')
  const [error,setError] = useState('')
  const [message,setMessage] = useState('')
  const [pending,setPending] = useState(false)
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setMessage('')
    if (!firebaseAuth) return setError('La connexion Firebase n’est pas configurée.')
    if (mode === 'register' && password !== confirmation) return setError('Les mots de passe ne correspondent pas.')
    setPending(true)
    try {
      await setPersistence(firebaseAuth, browserLocalPersistence)
      if (mode === 'register') await createUserWithEmailAndPassword(firebaseAuth, email.trim(), password)
      else await signInWithEmailAndPassword(firebaseAuth, email.trim(), password)
    } catch (reason) { setError(authErrorMessage(reason)) }
    finally { setPending(false) }
  }
  const resetPassword = async () => {
    if (!firebaseAuth || !email.trim()) return setError('Saisissez votre e-mail pour recevoir le lien de réinitialisation.')
    setError(''); setMessage('')
    try { await sendPasswordResetEmail(firebaseAuth, email.trim()); setMessage('Un e-mail de réinitialisation vient d’être envoyé.') }
    catch (reason) { setError(authErrorMessage(reason)) }
  }
  return <main className="auth-shell"><section className="auth-card"><div className="brand-mark">CB</div><p className="eyebrow">COACHBOARD</p><h1>{mode === 'register' ? 'Créez votre espace coach' : 'Bon retour, coach'}</h1><p className="auth-intro">{mode === 'register' ? 'Votre équipe sera synchronisée et accessible sur tous vos appareils.' : 'Connectez-vous pour retrouver votre équipe.'}</p><form onSubmit={submit}><Field label="Adresse e-mail"><input required type="email" autoComplete="email" placeholder="coach@club.fr" value={email} onChange={e=>setEmail(e.target.value)}/></Field><Field label="Mot de passe"><input required minLength={6} type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} placeholder="6 caractères minimum" value={password} onChange={e=>setPassword(e.target.value)}/></Field>{mode === 'register' && <Field label="Confirmer le mot de passe"><input required type="password" autoComplete="new-password" value={confirmation} onChange={e=>setConfirmation(e.target.value)}/></Field>}{error && <p className="auth-feedback error" role="alert">{error}</p>}{message && <p className="auth-feedback success">{message}</p>}<button className="save-button" disabled={pending}>{pending ? 'Un instant…' : mode === 'register' ? 'Créer mon compte' : 'Se connecter'}</button></form>{mode === 'login' && <button type="button" className="auth-link" onClick={resetPassword}>Mot de passe oublié ?</button>}<p className="auth-switch">{mode === 'register' ? 'Vous avez déjà un compte ?' : 'Pas encore de compte ?'} <button type="button" onClick={()=>{setMode(mode === 'register' ? 'login' : 'register');setError('');setMessage('')}}>{mode === 'register' ? 'Se connecter' : 'Créer un compte'}</button></p></section></main>
}

function ClaimAccountScreen({user}:{user:User}) {
  const [email,setEmail] = useState('')
  const [password,setPassword] = useState('')
  const [confirmation,setConfirmation] = useState('')
  const [error,setError] = useState('')
  const [pending,setPending] = useState(false)
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError('')
    if (password !== confirmation) return setError('Les mots de passe ne correspondent pas.')
    setPending(true)
    try {
      if (!firebaseAuth) throw new Error('Authentication indisponible')
      await setPersistence(firebaseAuth, browserLocalPersistence)
      await linkWithCredential(user, EmailAuthProvider.credential(email.trim(), password))
    } catch (reason) { setError(authErrorMessage(reason)) }
    finally { setPending(false) }
  }
  return <main className="auth-shell"><section className="auth-card"><div className="brand-mark">CB</div><p className="eyebrow">SÉCURISEZ VOTRE ÉQUIPE</p><h1>Créez vos accès</h1><p className="auth-intro">Votre équipe existe déjà. Ajoutez une adresse e-mail et un mot de passe pour la retrouver sur tous vos appareils.</p><form onSubmit={submit}><Field label="Adresse e-mail"><input required type="email" autoComplete="email" placeholder="coach@club.fr" value={email} onChange={e=>setEmail(e.target.value)}/></Field><Field label="Mot de passe"><input required minLength={6} type="password" autoComplete="new-password" placeholder="6 caractères minimum" value={password} onChange={e=>setPassword(e.target.value)}/></Field><Field label="Confirmer le mot de passe"><input required type="password" autoComplete="new-password" value={confirmation} onChange={e=>setConfirmation(e.target.value)}/></Field>{error && <p className="auth-feedback error" role="alert">{error}</p>}<button className="save-button" disabled={pending}>{pending ? 'Un instant…' : 'Sécuriser mon équipe'}</button></form></section></main>
}

function Onboarding({email,onComplete}:{email:string;onComplete:(team:TeamProfile)=>void}) {
  const [step,setStep] = useState<1|2>(1)
  const [name,setName] = useState('')
  const [category,setCategory] = useState('U18')
  const [season,setSeason] = useState(currentSeason)
  if (step === 1) return <main className="auth-shell"><section className="auth-card onboarding-card"><div className="brand-mark">CB</div><p className="eyebrow">ÉTAPE 1 SUR 2</p><h1>Bienvenue dans CoachBoard</h1><p className="auth-intro">Votre compte <b>{email}</b> est sécurisé. Configurons maintenant votre première équipe.</p><button className="save-button" onClick={()=>setStep(2)}>Configurer mon équipe</button></section></main>
  return <main className="auth-shell"><section className="auth-card onboarding-card"><p className="eyebrow">ÉTAPE 2 SUR 2</p><h1>Votre équipe</h1><p className="auth-intro">Vous pourrez modifier ces informations plus tard.</p><Field label="Nom de l’équipe"><input autoFocus required placeholder="Ex. Olympique Lyonnais U18" value={name} onChange={e=>setName(e.target.value)}/></Field><div className="form-grid"><Field label="Catégorie"><select value={category} onChange={e=>setCategory(e.target.value)}>{teamCategories.map(option=><option key={option} value={option}>{option}</option>)}</select></Field><Field label="Saison"><select value={season} onChange={e=>setSeason(e.target.value)}>{seasonOptions.map(option=><option key={option} value={option}>{option}</option>)}</select></Field></div><button disabled={!name.trim()} className="save-button" onClick={()=>onComplete({name:name.trim(),category,season,onboardingCompleted:true})}>Accéder à mon équipe</button><button className="auth-link" onClick={()=>setStep(1)}>Retour</button></section></main>
}

function authErrorMessage(reason: unknown) {
  const code = typeof reason === 'object' && reason && 'code' in reason ? String(reason.code) : ''
  if (code.includes('email-already-in-use')) return 'Cette adresse e-mail est déjà utilisée.'
  if (code.includes('credential-already-in-use')) return 'Cette adresse e-mail est déjà utilisée par un autre compte.'
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) return 'E-mail ou mot de passe incorrect.'
  if (code.includes('weak-password')) return 'Choisissez un mot de passe d’au moins 6 caractères.'
  if (code.includes('invalid-email')) return 'Saisissez une adresse e-mail valide.'
  if (code.includes('operation-not-allowed')) return 'Activez E-mail/Mot de passe dans Firebase Authentication.'
  return 'Une erreur est survenue. Réessayez dans un instant.'
}

function Dashboard({data,go,setMatch}:{data:AppData;go:(v:View)=>void;setMatch:(id:string)=>void}) {
 const nextSession=[...data.sessions].sort((a,b)=>`${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))[0]; const nextMatch=[...data.matches].filter(m=>!m.completed).sort((a,b)=>`${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))[0]
 const unavailable=data.players.filter(p=>p.active&&p.availability!=='disponible'); const attendance=nextSession?Object.values(nextSession.attendance).filter(a=>a==='présent').length:0
 if (data.players.length === 0) return <><section className="welcome"><div><p className="eyebrow">VOTRE ÉQUIPE EST PRÊTE</p><h2>Commençons par le groupe.</h2><p>Ajoutez vos joueurs pour préparer les séances, convocations et compositions.</p></div><div className="ball">⚽</div></section><section className="first-steps"><p className="eyebrow">PREMIÈRE ÉTAPE</p><h3>Ajoutez votre premier joueur</h3><p>Renseignez son nom, numéro et poste. Vous pourrez compléter l’effectif ensuite.</p><button className="primary" onClick={()=>go('effectif')}>Ajouter un joueur</button></section></>
 return <><section className="welcome"><div><p className="eyebrow">BONJOUR, COACH</p><h2>Prêt pour la séance ?</h2><p>Gardez le groupe concentré, une décision à la fois.</p></div><div className="ball">⚽</div></section>
 <div className="section-title"><h3>À venir</h3><button onClick={()=>go('matchs')}>Voir tout</button></div>
 <div className="schedule-grid">
  <article className="next-card session"><span className="card-icon">↗</span><p>PROCHAINE SÉANCE</p><h3>{nextSession?.title||'Aucune séance'}</h3><strong>{nextSession?`${formatDate(nextSession.date)} · ${nextSession.time}`:'Créez votre première séance'}</strong><div className="card-footer"><span>{attendance}/{data.players.filter(p=>p.active).length} réponses</span><button onClick={()=>go('présences')}>Présences →</button></div></article>
  <article className="next-card match"><span className="card-icon">◉</span><p>PROCHAIN MATCH</p><h3>{nextMatch?.home?'vs ':'@ '}{nextMatch?.opponent||'À planifier'}</h3><strong>{nextMatch?`${formatDate(nextMatch.date)} · ${nextMatch.time}`:'Ajoutez une rencontre'}</strong><div className="card-footer"><span>{nextMatch?.venue||'—'}</span><button onClick={()=>{if(nextMatch)setMatch(nextMatch.id);go('tactique')}}>Composer →</button></div></article>
 </div>
 <div className="section-title"><h3>Groupe du jour</h3><button onClick={()=>go('effectif')}>Effectif</button></div>
 <div className="metric-row"><Metric value={data.players.filter(p=>p.active).length} label="joueurs actifs" tone="dark"/><Metric value={unavailable.length} label="indisponibles" tone={unavailable.length?'orange':'green'}/><Metric value={`${Math.round(attendance/Math.max(1,data.players.length)*100)}%`} label="présents séance" tone="lime"/></div>
 {unavailable.length>0&&<section className="availability"><div className="section-title"><h3>À surveiller</h3><span className="count">{unavailable.length}</span></div>{unavailable.map(p=><div className="person-row" key={p.id}><span className="mini-avatar">{initials(p)}</span><div><strong>{fullName(p)}</strong><small>{p.mainPosition} · N°{p.number}</small></div><span className={`status ${p.availability}`}>{p.availability}</span></div>)}</section>}
 </>
}
function Metric({value,label,tone}:{value:string|number;label:string;tone:string}) { return <div className={`metric ${tone}`}><strong>{value}</strong><span>{label}</span></div> }
function Roster({players,onAdd,onEdit,update}:{players:Player[];onAdd:()=>void;onEdit:(p:Player)=>void;update:(fn:(d:AppData)=>AppData)=>void}) { const [query,setQuery]=useState('');const visible=players.filter(p=>fullName(p).toLowerCase().includes(query.toLowerCase())); return <><div className="page-heading"><div><p className="eyebrow">GROUPE U18</p><h2>L’effectif</h2><p>{players.length} joueurs actifs</p></div><button className="primary round" onClick={onAdd}>＋</button></div><label className="search">⌕<input placeholder="Rechercher un joueur" value={query} onChange={e=>setQuery(e.target.value)}/></label><div className="roster-list">{visible.map(p=><article className="player-card" key={p.id} onClick={()=>onEdit(p)}><div className="jersey">{p.number}</div><div className="player-info"><h3>{fullName(p)}</h3><p>{p.mainPosition}{p.secondaryPosition?` · ${p.secondaryPosition}`:''}</p></div><span className={`dot ${p.availability}`}/><button className="more" onClick={e=>{e.stopPropagation();update(d=>({...d,players:d.players.map(x=>x.id===p.id?{...x,active:false}:x)}))}} aria-label={`Désactiver ${fullName(p)}`}>•••</button></article>)}</div></> }

function AttendanceView({data,selected,setSelected,newSession,update}:{data:AppData;selected:string;setSelected:(x:string)=>void;newSession:()=>void;update:(fn:(d:AppData)=>AppData)=>void}) { const session=data.sessions.find(s=>s.id===selected); const players=data.players.filter(p=>p.active); const counts=useMemo(()=>{const c:Record<Attendance,number>={présent:0,absent:0,blessé:0,excusé:0};Object.values(session?.attendance||{}).forEach(x=>c[x]++);return c},[session]); const change=(id:string,status:Attendance)=>update(d=>({...d,sessions:d.sessions.map(s=>s.id===selected?{...s,attendance:{...s.attendance,[id]:status}}:s)})); return <><div className="page-heading"><div><p className="eyebrow">ORGANISATION</p><h2>Présences</h2></div><button className="primary" onClick={newSession}>Nouvelle</button></div><div className="session-picker">{data.sessions.map(s=><button className={s.id===selected?'selected':''} key={s.id} onClick={()=>setSelected(s.id)}><strong>{formatDate(s.date)}</strong><span>{s.title}</span></button>)}</div>{session&&<><section className="attendance-head"><div><h3>{session.title}</h3><p>{formatDate(session.date)} · {session.time}</p></div><div className="present-score"><b>{counts.présent}</b>/{players.length}<small>présents</small></div></section><div className="attendance-summary">{(['présent','absent','blessé','excusé'] as Attendance[]).map(s=><span key={s} className={s}>{counts[s]} {s}</span>)}</div><p className="helper">Touchez un statut pour le modifier rapidement.</p><div className="attendance-list">{players.map(p=>{const current=session.attendance[p.id]||'absent';return <article key={p.id}><span className="mini-avatar">{initials(p)}</span><div className="player-info"><strong>{fullName(p)}</strong><small>N°{p.number} · {p.mainPosition}</small></div><div className="status-options">{(['présent','absent','blessé','excusé'] as Attendance[]).map(s=><button key={s} aria-label={s} title={s} onClick={()=>change(p.id,s)} className={`${s} ${current===s?'chosen':''}`}>{s==='présent'?'✓':s==='absent'?'—':s==='blessé'?'＋':'E'}</button>)}</div></article>})}</div></>}</> }

function MatchesView({data,activeMatch,setActiveMatch,newMatch}:{data:AppData;activeMatch:string;setActiveMatch:(x:string)=>void;newMatch:()=>void}) { return <><div className="page-heading"><div><p className="eyebrow">CALENDRIER</p><h2>Matchs</h2></div><button className="primary" onClick={newMatch}>＋ Créer</button></div><div className="matches-list">{data.matches.sort((a,b)=>`${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)).map(m=><article className={`match-row ${m.id===activeMatch?'focus':''}`} key={m.id} onClick={()=>setActiveMatch(m.id)}><time><b>{new Date(`${m.date}T12:00`).toLocaleDateString('fr-FR',{day:'2-digit'})}</b><span>{new Date(`${m.date}T12:00`).toLocaleDateString('fr-FR',{month:'short'}).replace('.','')}</span></time><div className="match-main"><small>{m.home?'DOMICILE':'EXTÉRIEUR'} · {m.time}</small><h3>{m.home?'U18':' '+m.opponent} <span>vs</span> {m.home?m.opponent:'U18'}</h3><p>⌖ {m.venue}</p></div><div className="match-action">{m.completed?<strong>{m.scoreHome}–{m.scoreAway}</strong>:<><span>{m.calledUp.length} conv.</span><b>›</b></>}</div></article>)}</div></> }

function Tactics({match,players,update,report}:{match:Match;players:Player[];update:(fn:(d:AppData)=>AppData)=>void;report:()=>void}) { const [selected,setSelected]=useState<string|null>(null); const slots=formSlots(match.formation); const unassigned=match.calledUp.filter(id=>!Object.values(match.lineup).includes(id)); const assign=(slot:string)=>{if(!selected)return;update(d=>({...d,matches:d.matches.map(m=>m.id===match.id?{...m,lineup:{...m.lineup,[slot]:selected},substitutes:m.substitutes.filter(x=>x!==selected)}:m)}));setSelected(null)}; const toggleFormation=()=>update(d=>({...d,matches:d.matches.map(m=>m.id===match.id?{...m,formation:m.formation==='4-4-2'?'4-2-3-1':'4-4-2',lineup:{}}:m)})); const selectPlayer=(id:string)=>setSelected(selected===id?null:id); const occupied=Object.values(match.lineup);return <><div className="page-heading tactics-heading"><div><button className="back" onClick={()=>history.back()}>‹</button><p className="eyebrow">FEUILLE DE MATCH</p><h2>{match.home?'U18 vs':' '+match.opponent+' vs'} {match.home?match.opponent:'U18'}</h2><p>{formatDate(match.date)} · {match.venue}</p></div>{match.completed?<button className="primary" onClick={report}>Voir bilan</button>:<button className="primary" onClick={report}>Après-match</button>}</div><div className="tactics-toolbar"><button onClick={toggleFormation}>Formation <b>{match.formation}</b>⌄</button><span><b>{occupied.length}</b>/11 titulaires</span></div><p className="helper">{selected ? `Sélection : ${fullName(players.find(p=>p.id===selected))}. Touchez un poste sur le terrain.` : 'Touchez un joueur, puis un poste sur le terrain.'}</p><Pitch slots={slots} lineup={match.lineup} players={players} selected={selected} onSlot={assign}/><div className="bench-section"><div className="section-title"><h3>{occupied.length<11?'Joueurs à placer':'Remplaçants'}</h3><span>{unassigned.length}</span></div><div className="player-chips">{unassigned.map(id=>{const p=players.find(x=>x.id===id);return p&&<button onClick={()=>selectPlayer(id)} className={selected===id?'selected':''} key={id}><span>{p.number}</span>{p.lastName}</button>})}</div></div><div className="bench-section"><div className="section-title"><h3>Titulaires</h3><span>{occupied.length}</span></div><div className="lineup-list">{slots.filter(s=>match.lineup[s]).map(s=>{const p=players.find(x=>x.id===match.lineup[s]);return p&&<button key={s} onClick={()=>selectPlayer(p.id)}><span className="slot-label">{labelSlot(s)}</span><span>{p.number}</span>{fullName(p)}<i>×</i></button>})}</div></div><button disabled={occupied.length<11} className="confirm-lineup" onClick={()=>alert('Feuille de match validée. Bonne rencontre !')}>✓ Valider la feuille de match</button></> }
function Pitch({slots,lineup,players,selected,onSlot}:{slots:string[];lineup:Record<string,string>;players:Player[];selected:string|null;onSlot:(s:string)=>void}) { const pos:Record<string,string>={GB:'50% 88%',DD:'84% 72%',DC1:'61% 74%',DC2:'39% 74%',DG:'16% 72%',MDC1:'37% 57%',MDC2:'63% 57%',MD1:'37% 56%',MD2:'63% 56%',AD:'83% 39%',MOC:'50% 40%',AG:'17% 39%',BU:'50% 17%',BU1:'35% 18%',BU2:'65% 18%'};return <div className="pitch"><div className="pitch-lines"/>{slots.map(slot=>{const p=players.find(x=>x.id===lineup[slot]);return <button key={slot} onClick={()=>onSlot(slot)} className={`pitch-player ${p?'filled':''} ${selected?'target':''}`} style={{left:pos[slot].split(' ')[0],top:pos[slot].split(' ')[1]}}><span>{p?p.number:'+'}</span><small>{p?p.lastName:labelSlot(slot)}</small></button>})}</div> }

function Stats({data,onOpenPlayer}:{data:AppData;onOpenPlayer:(player:Player)=>void}) { const players=data.players.filter(p=>p.active);const stats=players.map(p=>{const attendance=data.sessions.reduce((n,s)=>n+(s.attendance[p.id]==='présent'?1:0),0);const selected=data.matches.reduce((n,m)=>n+(m.calledUp.includes(p.id)?1:0),0);const started=data.matches.reduce((n,m)=>n+(Object.values(m.lineup).includes(p.id)?1:0),0);const events=data.matches.flatMap(m=>m.events);return {p,attendance,selected,started,goals:events.filter(e=>e.playerId===p.id&&e.type==='but').length,assists:events.filter(e=>e.playerId===p.id&&e.type==='passe').length,cards:events.filter(e=>e.playerId===p.id&&['jaune','rouge'].includes(e.type)).length}}).sort((a,b)=>b.goals-a.goals||b.started-a.started); return <><div className="page-heading"><div><p className="eyebrow">SAISON 2026–27</p><h2>Statistiques</h2><p>Touchez un joueur pour voir son suivi détaillé.</p></div></div><section className="stat-hero"><div><b>{data.matches.filter(m=>m.completed).length}</b><span>matchs joués</span></div><div><b>{data.sessions.length}</b><span>séances</span></div><div><b>{Math.round(data.sessions.reduce((n,s)=>n+Object.values(s.attendance).filter(x=>x==='présent').length,0)/Math.max(1,data.sessions.length*players.length)*100)}%</b><span>présence</span></div></section><div className="table-wrap"><table><thead><tr><th>Joueur</th><th>Prés.</th><th>M.</th><th>Tit.</th><th>⚽</th><th>PD</th><th>▰</th></tr></thead><tbody>{stats.map(({p,attendance,selected,started,goals,assists,cards})=><tr key={p.id}><td><button className="player-stat-link" onClick={()=>onOpenPlayer(p)} aria-label={`Voir les statistiques de ${fullName(p)}`}><span className="table-number">{p.number}</span>{p.lastName}<span>›</span></button></td><td>{attendance}/{data.sessions.length}</td><td>{selected}</td><td>{started}</td><td>{goals}</td><td>{assists}</td><td>{cards||'—'}</td></tr>)}</tbody></table></div></> }

function PlayerStatsSheet({player,data,onClose}:{player:Player;data:AppData;onClose:()=>void}) {
  const sessions=[...data.sessions].sort((a,b)=>`${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`))
  const matches=[...data.matches].filter(m=>m.calledUp.includes(player.id)).sort((a,b)=>`${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`))
  const present=sessions.filter(s=>s.attendance[player.id]==='présent').length
  const started=matches.filter(m=>Object.values(m.lineup).includes(player.id)).length
  const events=data.matches.flatMap(m=>m.events).filter(e=>e.playerId===player.id)
  const goals=events.filter(e=>e.type==='but').length
  const assists=events.filter(e=>e.type==='passe').length
  const cards=events.filter(e=>e.type==='jaune'||e.type==='rouge').length
  const attendanceRate=Math.round(present/Math.max(1,sessions.length)*100)
  return <Sheet title="Fiche joueur" close={onClose}><section className="player-detail-hero"><div className="detail-jersey">{player.number}</div><div><p className="eyebrow">{player.mainPosition}{player.secondaryPosition?` · ${player.secondaryPosition}`:''}</p><h3>{fullName(player)}</h3><span className={`status ${player.availability}`}>{player.availability}</span></div></section><section className="player-kpis"><div><b>{attendanceRate}%</b><span>présence</span></div><div><b>{matches.length}</b><span>matchs</span></div><div><b>{started}</b><span>titularisations</span></div><div><b>{goals + assists}</b><span>actions décisives</span></div></section><section className="detail-section"><div className="detail-heading"><h3>Entraînements</h3><span>{present}/{sessions.length} présents</span></div>{sessions.length===0?<p className="detail-empty">Aucune séance enregistrée.</p>:<div className="detail-list">{sessions.map(session=>{const status=session.attendance[player.id]||'non renseigné';return <article key={session.id}><div><strong>{session.title}</strong><small>{formatDate(session.date)} · {session.time}</small></div><span className={`attendance-tag ${status}`}>{status}</span></article>})}</div>}</section><section className="detail-section"><div className="detail-heading"><h3>Matchs</h3><span>{goals} but{goals!==1?'s':''} · {assists} PD · {cards} carton{cards!==1?'s':''}</span></div>{matches.length===0?<p className="detail-empty">Aucun match pour ce joueur.</p>:<div className="detail-list">{matches.map(match=>{const isStarter=Object.values(match.lineup).includes(player.id);const matchEvents=match.events.filter(event=>event.playerId===player.id);const score=match.completed?`U18 ${match.scoreHome??0}–${match.scoreAway??0} ${match.opponent}`:'À venir';return <article key={match.id}><div><strong>vs {match.opponent}</strong><small>{formatDate(match.date)} · {isStarter?'Titulaire':'Convoqué'} · {score}</small>{matchEvents.length>0&&<small className="event-summary">{matchEvents.map(event=>event.type==='but'?'⚽ but':event.type==='passe'?'PD passe':event.type==='jaune'?'▰ jaune':event.type==='rouge'?'▰ rouge':event.type).join(' · ')}</small>}</div><span className={`match-role ${isStarter?'starter':''}`}>{isStarter?'Titulaire':'Convoqué'}</span></article>})}</div>}</section></Sheet>
}

function PlayerSheet({player,onClose,onSave}:{player?:Player;onClose:()=>void;onSave:(p:Player)=>void}) { const [p,setP]=useState<Player>(player||{id:uid(),firstName:'',lastName:'',number:0,mainPosition:'MC',availability:'disponible',active:true});const set=(field:keyof Player,value:string|number)=>setP(x=>({...x,[field]:value}));return <Sheet title={player?'Modifier le joueur':'Nouveau joueur'} close={onClose}><div className="form-grid"><Field label="Prénom"><input autoFocus value={p.firstName} onChange={e=>set('firstName',e.target.value)}/></Field><Field label="Nom"><input value={p.lastName} onChange={e=>set('lastName',e.target.value)}/></Field><Field label="Numéro"><input type="number" min="1" max="99" value={p.number||''} onChange={e=>set('number',Number(e.target.value))}/></Field><Field label="Statut"><select value={p.availability} onChange={e=>set('availability',e.target.value as Availability)}><option value="disponible">Disponible</option><option value="indisponible">Indisponible</option><option value="blessé">Blessé</option></select></Field><Field label="Poste principal"><select value={p.mainPosition} onChange={e=>set('mainPosition',e.target.value)}>{positions.map(x=><option key={x}>{x}</option>)}</select></Field><Field label="Poste secondaire"><select value={p.secondaryPosition||''} onChange={e=>set('secondaryPosition',e.target.value)}><option value="">Aucun</option>{positions.map(x=><option key={x}>{x}</option>)}</select></Field></div><button disabled={!p.firstName||!p.lastName||!p.number} className="save-button" onClick={()=>onSave(p)}>Enregistrer le joueur</button></Sheet> }
function SessionSheet({onClose,onSave}:{onClose:()=>void;onSave:(s:Session)=>void}) {const now=new Date();const [title,setTitle]=useState('Entraînement');const [date,setDate]=useState(now.toISOString().slice(0,10));const [time,setTime]=useState('18:30');return <Sheet title="Nouvelle séance" close={onClose}><Field label="Intitulé"><input value={title} onChange={e=>setTitle(e.target.value)}/></Field><div className="form-grid"><Field label="Date"><input type="date" value={date} onChange={e=>setDate(e.target.value)}/></Field><Field label="Heure"><input type="time" value={time} onChange={e=>setTime(e.target.value)}/></Field></div><button className="save-button" onClick={()=>onSave({id:uid(),title,date,time,attendance:{}})}>Créer la séance</button></Sheet> }
function MatchSheet({players,onClose,onSave}:{players:Player[];onClose:()=>void;onSave:(m:Match)=>void}) {const now=new Date();const [opponent,setOpponent]=useState('');const [date,setDate]=useState(now.toISOString().slice(0,10));const [time,setTime]=useState('15:00');const [venue,setVenue]=useState('Stade des Cèdres');const [home,setHome]=useState(true);const available=players.filter(p=>p.availability==='disponible');const [calledUp,setCalledUp]=useState<string[]>(()=>available.map(p=>p.id));const toggle=(id:string)=>setCalledUp(x=>x.includes(id)?x.filter(v=>v!==id):[...x,id]);return <Sheet title="Créer un match" close={onClose}><Field label="Adversaire"><input autoFocus placeholder="Ex. AS Montchat" value={opponent} onChange={e=>setOpponent(e.target.value)}/></Field><div className="form-grid"><Field label="Date"><input type="date" value={date} onChange={e=>setDate(e.target.value)}/></Field><Field label="Heure"><input type="time" value={time} onChange={e=>setTime(e.target.value)}/></Field></div><Field label="Lieu"><input value={venue} onChange={e=>setVenue(e.target.value)}/></Field><div className="toggle-choice"><button className={home?'active':''} onClick={()=>setHome(true)}>Domicile</button><button className={!home?'active':''} onClick={()=>setHome(false)}>Extérieur</button></div><div className="callup-head"><strong>Convoqués</strong><span>{calledUp.length} sélectionnés</span></div><div className="callup-list">{available.map(p=><button key={p.id} onClick={()=>toggle(p.id)} className={calledUp.includes(p.id)?'checked':''}><span>{calledUp.includes(p.id)?'✓':'+'}</span><b>N°{p.number}</b>{fullName(p)}</button>)}</div><button disabled={!opponent||calledUp.length<11} className="save-button" onClick={()=>onSave({id:uid(),opponent,date,time,venue,home,calledUp,formation:'4-2-3-1',lineup:{},substitutes:[],events:[]})}>Créer et préparer la compo</button></Sheet> }
function ReportSheet({match,players,onClose,onSave}:{match:Match;players:Player[];onClose:()=>void;onSave:(m:Match)=>void}) {const [home,setHome]=useState(match.scoreHome?.toString()||'');const [away,setAway]=useState(match.scoreAway?.toString()||'');const [summary,setSummary]=useState(match.summary||'');const [events,setEvents]=useState<MatchEvent[]>(match.events);const add=(type:MatchEvent['type'])=>setEvents(x=>[...x,{id:uid(),type,playerId:match.calledUp[0]||players[0].id,minute:undefined}]);return <Sheet title="Après-match" close={onClose}><div className="score-form"><div><label>U18</label><input inputMode="numeric" value={home} onChange={e=>setHome(e.target.value)}/></div><b>—</b><div><label>{match.opponent}</label><input inputMode="numeric" value={away} onChange={e=>setAway(e.target.value)}/></div></div><div className="event-head"><h3>Événements</h3><div>{(['but','passe','jaune','rouge'] as MatchEvent['type'][]).map(t=><button key={t} onClick={()=>add(t)}>+ {t}</button>)}</div></div>{events.map((e,i)=><div className="event-row" key={e.id}><select value={e.type} onChange={ev=>setEvents(x=>x.map((a,j)=>j===i?{...a,type:ev.target.value as MatchEvent['type']}:a))}><option value="but">But</option><option value="passe">Passe</option><option value="jaune">Carton jaune</option><option value="rouge">Carton rouge</option><option value="entrée">Entrée</option><option value="sortie">Sortie</option></select><select value={e.playerId} onChange={ev=>setEvents(x=>x.map((a,j)=>j===i?{...a,playerId:ev.target.value}:a))}>{match.calledUp.map(id=>{const p=players.find(x=>x.id===id);return p&&<option key={id} value={id}>{p.number} · {fullName(p)}</option>})}</select><input placeholder="min." type="number" value={e.minute||''} onChange={ev=>setEvents(x=>x.map((a,j)=>j===i?{...a,minute:Number(ev.target.value)}:a))}/><button onClick={()=>setEvents(x=>x.filter((_,j)=>j!==i))}>×</button></div>)}<Field label="Commentaire global"><textarea placeholder="Ce qui a fonctionné, axes de progrès..." value={summary} onChange={e=>setSummary(e.target.value)}/></Field><button className="save-button" onClick={()=>onSave({...match,scoreHome:Number(home||0),scoreAway:Number(away||0),summary,events,completed:true})}>Enregistrer le bilan</button></Sheet> }
function Sheet({title,close,children}:{title:string;close:()=>void;children:React.ReactNode}) {return <div className="sheet-backdrop" onMouseDown={close}><section className="sheet" onMouseDown={e=>e.stopPropagation()}><div className="sheet-handle"/><header><h2>{title}</h2><button onClick={close} aria-label="Fermer">×</button></header>{children}</section></div>}
function Field({label,children}:{label:string;children:React.ReactNode}) {return <label className="field"><span>{label}</span>{children}</label>}
function formatDate(date:string) {return new Date(`${date}T12:00`).toLocaleDateString('fr-FR',{weekday:'short',day:'numeric',month:'short'}).replace('.','')}

createRoot(document.getElementById('root')!).render(<App />)
