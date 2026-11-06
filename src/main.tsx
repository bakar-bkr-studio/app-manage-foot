import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { EmailAuthProvider, browserLocalPersistence, createUserWithEmailAndPassword, linkWithCredential, onIdTokenChanged, sendPasswordResetEmail, setPersistence, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth'
import { cloudRepository, emptyAppData, repository } from './data'
import { dataMode, firebaseAuth, firebaseConfigured } from './firebase'
import { MotionPage } from './motion'
import { AccountPage, ProfileForm, TeamForm } from './account'
import type { AppData, Attendance, Availability, CoachProfile, Match, MatchEvent, Player, Position, Session, TeamProfile, TeamRecord } from './types'
import './styles.css'
import './callups.css'
import './auth.css'
import './stats.css'
import './tactics.css'
import './roster.css'
import './attendance.css'
import './matches.css'
import './motion.css'

type View = 'accueil'|'effectif'|'présences'|'matchs'|'tactique'|'stats'|'profil'
type RosterFilter = 'tous'|'gardiens'|'défenseurs'|'milieux'|'attaquants'
type RankingMetric = 'goals'|'assists'|'attendance'|'starts'|'contributions'|'discipline'
const positions: Position[] = ['GB','DD','DC','DG','MDC','MC','MOC','AD','AG','BU']
const formations: Match['formation'][] = ['4-4-2','4-2-3-1','3-5-2','3-4-3']
const formSlots = (formation: Match['formation']) => formation === '4-4-2'
  ? ['GB','DD','DC1','DC2','DG','MD1','MD2','AD','AG','BU1','BU2']
  : formation === '4-2-3-1'
    ? ['GB','DD','DC1','DC2','DG','MDC1','MDC2','AD','MOC','AG','BU']
    : formation === '3-5-2'
      ? ['GB','DC1','DC2','DC3','PISTOND','MDC','MC1','MC2','PISTONG','BU1','BU2']
      : ['GB','DC1','DC2','DC3','PISTOND','MC1','MC2','PISTONG','AD','BU','AG']
const labelSlot = (s:string) => {
  const base = s.replace(/\d/g, '')
  if (base === 'MD') return 'MC'
  if (base === 'PISTOND') return 'PD'
  if (base === 'PISTONG') return 'PG'
  return base
}
const initials = (p: Player) => `${p.firstName[0]}${p.lastName[0]}`
const fullName = (p?: Player) => p ? `${p.firstName} ${p.lastName}` : '—'
const shortName = (p?: Player) => p ? `${p.firstName} ${p.lastName[0]}.` : '—'
const playerNumber = (p?: Player) => p?.number ? `N°${p.number}` : 'Sans n°'
const playerGroup = (position:Position): RosterFilter => position === 'GB' ? 'gardiens' : ['DD','DC','DG'].includes(position) ? 'défenseurs' : ['MDC','MC','MOC'].includes(position) ? 'milieux' : 'attaquants'
const uid = () => crypto.randomUUID()

function App() {
  const [session, setSession] = useState<{user:User|null}|undefined>(firebaseConfigured ? undefined : {user:null})
  useEffect(() => {
    if (!firebaseAuth) return
    return onIdTokenChanged(firebaseAuth, user=>setSession({user}))
  }, [])
  if (!firebaseConfigured) return <Workspace user={null}/>
  if (session === undefined) return <LoadingScreen/>
  const {user}=session
  if (!user) return <AuthScreen/>
  if (user.isAnonymous) return <ClaimAccountScreen user={user}/>
  return <Workspace key={user.uid} user={user}/>
}

function Workspace({user}:{user:User|null}) {
  const [profile,setProfile]=useState<CoachProfile|null|undefined>(()=>{if(user)return undefined;try{return JSON.parse(localStorage.getItem('coachboard-demo-profile')||'null')||{firstName:'Coach',lastName:'Démo'}}catch{return {firstName:'Coach',lastName:'Démo'}}})
  const [teams,setTeams]=useState<TeamRecord[]|undefined>(()=>{if(user)return undefined;try{const saved=JSON.parse(localStorage.getItem('coachboard-demo-teams')||'null');if(Array.isArray(saved)&&saved.length)return saved}catch{/* use demonstration data */}const data=repository.load();return [{id:'demo',data:{...data,team:data.team||{name:'CoachBoard',category:'U18',season:'2026–27',onboardingCompleted:true}}}]})
  const [activeId,setActiveId]=useState(()=>localStorage.getItem(`coachboard-active-team-${user?.uid||'demo'}`)||'')
  const [error,setError]=useState('')
  useEffect(()=>{
    if(!user)return
    const fail=()=>setError('Impossible de charger votre compte et vos équipes. Vérifiez votre connexion et réessayez.')
    const stopProfile=cloudRepository.subscribeProfile(user.uid,setProfile,fail)
    const stopTeams=cloudRepository.subscribeTeams(user.uid,setTeams,fail)
    return ()=>{stopProfile();stopTeams()}
  },[user])
  useEffect(()=>{if(!user&&teams)localStorage.setItem('coachboard-demo-teams',JSON.stringify(teams))},[user,teams])
  useEffect(()=>{if(!user&&profile)localStorage.setItem('coachboard-demo-profile',JSON.stringify(profile))},[user,profile])
  const selectTeam=(id:string)=>{localStorage.setItem(`coachboard-active-team-${user?.uid||'demo'}`,id);setActiveId(id)}
  const saveProfile=async(next:CoachProfile)=>{if(user)await cloudRepository.saveProfile(next);setProfile(next)}
  const saveTeamData=async(id:string,data:AppData)=>{
    if(user)await cloudRepository.save(id,data)
    else {setTeams(current=>current?.map(team=>team.id===id?{...team,data}:team));if(id==='demo')repository.save(data)}
  }
  const createTeam=async(team:TeamProfile)=>{
    if(user){const id=await cloudRepository.createTeam(team);selectTeam(id)}
    else {const id=uid();setTeams(current=>[...(current||[]),{id,data:{...emptyAppData(),team}}]);selectTeam(id)}
  }
  const logout=()=>{if(firebaseAuth&&window.confirm('Se déconnecter de CoachBoard ?'))signOut(firebaseAuth).catch(()=>setError('Déconnexion impossible. Réessayez.'))}
  if(error)return <main className="auth-shell"><section className="auth-card"><h1>Connexion indisponible</h1><p className="auth-intro" role="alert">{error}</p><button className="save-button" onClick={()=>window.location.reload()}>Réessayer</button>{user&&<button className="auth-link" onClick={logout}>Se déconnecter</button>}</section></main>
  if(profile===undefined||teams===undefined)return <LoadingScreen/>
  if(!profile)return <main className="auth-shell"><section className="auth-card"><div className="brand-mark">CB</div><p className="eyebrow">VOTRE PROFIL COACH</p><h1>Faisons connaissance</h1><p className="auth-intro">Ajoutez votre prénom et votre nom pour personnaliser votre espace.</p><ProfileForm onSave={saveProfile}/>{user&&<button className="auth-link" onClick={logout}>Se déconnecter</button>}</section></main>
  const completed=teams.filter(team=>team.data.team?.onboardingCompleted)
  if(completed.length===0)return <Onboarding email={user?.email||''} firstName={profile.firstName} onComplete={async team=>{if(user)await cloudRepository.createFirstTeam(team);else {setTeams([{id:'demo',data:{...repository.load(),team}}]);selectTeam('demo')}}}/>
  const active=completed.find(team=>team.id===activeId)||completed[0]
  return <CoachApp key={active.id} user={user} profile={profile} teams={completed} active={active} selectTeam={selectTeam} saveProfile={saveProfile} saveTeamData={saveTeamData} createTeam={createTeam} logout={logout} />
}

function CoachApp({user,profile,teams,active,selectTeam,saveProfile,saveTeamData,createTeam,logout}:{user:User|null;profile:CoachProfile;teams:TeamRecord[];active:TeamRecord;selectTeam:(id:string)=>void;saveProfile:(profile:CoachProfile)=>Promise<void>;saveTeamData:(id:string,data:AppData)=>Promise<void>;createTeam:(team:TeamProfile)=>Promise<void>;logout:()=>void}) {
  const [data, setData] = useState<AppData>(active.data)
  const dataRef=useRef(data)
  const [view, setView] = useState<View>('accueil')
  const [sheet, setSheet] = useState<'player'|'session'|'match'|'report'|'player-stats'|null>(null)
  const [activeSession, setActiveSession] = useState<string>('')
  const [activeMatch, setActiveMatch] = useState<string>(() => data.matches[0]?.id || '')
  const [editPlayer, setEditPlayer] = useState<Player | undefined>()
  const [matchTemplate, setMatchTemplate] = useState<Match | undefined>()
  const [statsPlayer, setStatsPlayer] = useState<Player | undefined>()
  const [toast, setToast] = useState('')
  const update = (fn: (current: AppData) => AppData) => {
    const next=fn(dataRef.current)
    dataRef.current=next
    setData(next)
    saveTeamData(active.id,next).catch(()=>notify('Sauvegarde impossible : vérifiez votre connexion.'))
  }
  const notify = (message:string) => { setToast(message); window.setTimeout(()=>setToast(''), 2200) }
  useEffect(()=>{dataRef.current=active.data;setData(active.data)},[active.data])
  useEffect(()=>{ if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(()=>undefined) },[])
  const activePlayers = data.players.filter(p=>p.active)
  const match = data.matches.find(m=>m.id===activeMatch)
  return <main className="app-shell">
    <header className="topbar"><div className="brand-mark">CB</div><div className="team-switcher"><p className="eyebrow">{data.team?.category || 'U18'} · SAISON {data.team?.season || '2026–27'}</p>{teams.length>1?<select aria-label="Changer d’équipe" value={active.id} onChange={event=>selectTeam(event.target.value)}>{teams.map(team=><option key={team.id} value={team.id}>{team.data.team?.name}</option>)}</select>:<h1>{data.team?.name || 'CoachBoard'}</h1>}</div><button className="avatar" title="Mon profil" aria-label="Mon profil" onClick={()=>setView('profil')}>{profile.firstName[0]?.toUpperCase()}{profile.lastName[0]?.toUpperCase()}</button></header>
    <section className="content">
      <MotionPage key={view}>
      {view==='accueil' && <Dashboard data={data} firstName={profile.firstName} go={setView} setMatch={setActiveMatch} />}
      {view==='effectif' && <Roster category={data.team?.category || 'U18'} players={activePlayers} onAdd={()=>{setEditPlayer(undefined);setSheet('player')}} onEdit={p=>{setEditPlayer(p);setSheet('player')}} />}
      {view==='présences' && <AttendanceView data={data} selected={activeSession} setSelected={setActiveSession} newSession={()=>setSheet('session')} update={update} />}
      {view==='matchs' && <MatchesView data={data} activeMatch={activeMatch} setActiveMatch={id=>{setActiveMatch(id);setView('tactique')}} newMatch={()=>{setMatchTemplate(undefined);setSheet('match')}} duplicateMatch={match=>{setMatchTemplate(match);setSheet('match')}} />}
      {view==='tactique' && match && <Tactics teamName={data.team?.name || data.team?.category || 'Mon équipe'} match={match} players={activePlayers} update={update} notify={notify} back={()=>setView('matchs')} onDelete={()=>{if(window.confirm(`Supprimer le match contre ${match.opponent} ? Cette action est irréversible.`)){update(current=>({...current,matches:current.matches.filter(item=>item.id!==match.id)}));setActiveMatch('');setView('matchs');notify('Match supprimé')}}} report={()=>setSheet('report')} />}
      {view==='stats' && <Stats data={data} onOpenPlayer={player=>{setStatsPlayer(player);setSheet('player-stats')}} />}
      {view==='profil' && <AccountPage user={user} profile={profile} teams={teams} activeTeamId={active.id} onSaveProfile={saveProfile} onSaveTeam={async(id,team)=>{const record=teams.find(item=>item.id===id);if(!record)throw new Error('Équipe introuvable');await saveTeamData(id,{...record.data,team})}} onCreateTeam={createTeam} onSwitch={selectTeam} onBack={()=>setView('accueil')} onSignOut={logout}/>}
      </MotionPage>
    </section>
    <nav className="bottom-nav" data-view={view} aria-label="Navigation principale">
      {([['accueil','⌂','Accueil'],['effectif','♙','Effectif'],['présences','✓','Présences'],['matchs','◉','Matchs'],['stats','▥','Stats']] as [View,string,string][]).map(([id,icon,label])=><button key={id} className={(view==='tactique'?'matchs':view)===id?'active':''} aria-current={(view==='tactique'?'matchs':view)===id?'page':undefined} aria-label={label} onClick={()=>setView(id)}><span aria-hidden="true">{icon}</span>{label}</button>)}
    </nav>
    {toast && <div className="toast">{toast}</div>}
    {sheet==='player' && <PlayerSheet player={editPlayer} onClose={()=>setSheet(null)} onSave={player=>{update(d=>({...d,players: editPlayer ? d.players.map(p=>p.id===player.id?player:p) : [...d.players,player]}));setSheet(null);notify(editPlayer?'Joueur mis à jour':'Joueur ajouté')}} onDeactivate={editPlayer?()=>{if(window.confirm(`Retirer ${fullName(editPlayer)} de l’effectif ? Ses données historiques seront conservées.`)) {update(d=>({...d,players:d.players.map(item=>item.id===editPlayer.id?{...item,active:false}:item)}));setSheet(null);notify(`${fullName(editPlayer)} retiré de l’effectif`)}}:undefined} />}
    {sheet==='session' && <SessionSheet onClose={()=>setSheet(null)} onSave={session=>{update(d=>({...d,sessions:[session,...d.sessions]}));setActiveSession(session.id);setSheet(null);notify('Séance créée')}} />}
    {sheet==='match' && <MatchSheet players={activePlayers} template={matchTemplate} onClose={()=>{setMatchTemplate(undefined);setSheet(null)}} onSave={newMatch=>{update(d=>({...d,matches:[newMatch,...d.matches]}));setActiveMatch(newMatch.id);setMatchTemplate(undefined);setSheet(null);setView('tactique');notify('Match créé : préparez votre composition')}} />}
    {sheet==='report' && match && <ReportSheet teamName={data.team?.name || data.team?.category || 'Mon équipe'} match={match} players={activePlayers} onClose={()=>setSheet(null)} onSave={updated=>{update(d=>({...d,matches:d.matches.map(m=>m.id===updated.id?updated:m)}));setSheet(null);notify('Après-match enregistré')}} />}
    {sheet==='player-stats' && statsPlayer && <PlayerStatsSheet player={statsPlayer} data={data} onClose={()=>setSheet(null)} />}
    {dataMode==='demo' && <div className="demo-badge" title="Les données sont enregistrées dans ce navigateur">Mode démo</div>}
    {!firebaseConfigured && active.id==='demo' && <button className="reset-demo" onClick={()=>{if(confirm('Réinitialiser les données de démonstration de cette équipe ?')) {const next=repository.reset();dataRef.current=next;setData(next);saveTeamData(active.id,next).catch(()=>notify('Réinitialisation impossible'));notify('Données réinitialisées')}}}>↻</button>}
  </main>
}

function LoadingScreen() { return <main className="auth-shell"><div className="auth-card"><div className="brand-mark">CB</div><p className="eyebrow">COACHBOARD</p><h1>Connexion sécurisée…</h1></div></main> }

function AuthScreen() {
  const [mode,setMode] = useState<'login'|'register'>('login')
  const [firstName,setFirstName] = useState('')
  const [lastName,setLastName] = useState('')
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
    if (mode === 'register' && (!firstName.trim() || !lastName.trim())) return setError('Renseignez votre prénom et votre nom.')
    setPending(true)
    try {
      await setPersistence(firebaseAuth, browserLocalPersistence)
      if (mode === 'register') {await createUserWithEmailAndPassword(firebaseAuth, email.trim(), password);await cloudRepository.saveProfile({firstName:firstName.trim(),lastName:lastName.trim()})}
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
  return <main className="auth-shell"><section className="auth-card"><div className="brand-mark">CB</div><p className="eyebrow">COACHBOARD</p><h1>{mode === 'register' ? 'Créez votre espace coach' : 'Bon retour, coach'}</h1><p className="auth-intro">{mode === 'register' ? 'Votre équipe sera synchronisée et accessible sur tous vos appareils.' : 'Connectez-vous pour retrouver votre équipe.'}</p><form onSubmit={submit}>{mode==='register'&&<div className="form-grid"><Field label="Prénom"><input required autoComplete="given-name" value={firstName} onChange={e=>setFirstName(e.target.value)}/></Field><Field label="Nom"><input required autoComplete="family-name" value={lastName} onChange={e=>setLastName(e.target.value)}/></Field></div>}<Field label="Adresse e-mail"><input required type="email" autoComplete="email" placeholder="coach@club.fr" value={email} onChange={e=>setEmail(e.target.value)}/></Field><Field label="Mot de passe"><input required minLength={6} type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} placeholder="6 caractères minimum" value={password} onChange={e=>setPassword(e.target.value)}/></Field>{mode === 'register' && <Field label="Confirmer le mot de passe"><input required type="password" autoComplete="new-password" value={confirmation} onChange={e=>setConfirmation(e.target.value)}/></Field>}{error && <p className="auth-feedback error" role="alert">{error}</p>}{message && <p className="auth-feedback success">{message}</p>}<button className="save-button" disabled={pending}>{pending ? 'Un instant…' : mode === 'register' ? 'Créer mon compte' : 'Se connecter'}</button></form>{mode === 'login' && <button type="button" className="auth-link" onClick={resetPassword}>Mot de passe oublié ?</button>}<p className="auth-switch">{mode === 'register' ? 'Vous avez déjà un compte ?' : 'Pas encore de compte ?'} <button type="button" onClick={()=>{setMode(mode === 'register' ? 'login' : 'register');setError('');setMessage('')}}>{mode === 'register' ? 'Se connecter' : 'Créer un compte'}</button></p></section></main>
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

function Onboarding({email,firstName,onComplete}:{email:string;firstName:string;onComplete:(team:TeamProfile)=>Promise<void>}) {
  const [step,setStep] = useState<1|2>(1)
  if (step === 1) return <main className="auth-shell"><section className="auth-card onboarding-card"><div className="brand-mark">CB</div><p className="eyebrow">ÉTAPE 1 SUR 2</p><h1>Bienvenue, {firstName}</h1><p className="auth-intro">{email&&<>Votre compte <b>{email}</b> est prêt. </>}Configurons maintenant votre première équipe.</p><button className="save-button" onClick={()=>setStep(2)}>Configurer mon équipe</button></section></main>
  return <main className="auth-shell"><section className="auth-card onboarding-card"><p className="eyebrow">ÉTAPE 2 SUR 2</p><h1>Votre équipe</h1><p className="auth-intro">Vous pourrez modifier ces informations plus tard.</p><TeamForm onSave={onComplete}/><button className="auth-link" onClick={()=>setStep(1)}>Retour</button></section></main>
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

function Dashboard({data,firstName,go,setMatch}:{data:AppData;firstName:string;go:(v:View)=>void;setMatch:(id:string)=>void}) {
 const nextSession=[...data.sessions].sort((a,b)=>`${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))[0]; const nextMatch=[...data.matches].filter(m=>!m.completed).sort((a,b)=>`${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))[0]
 const unavailable=data.players.filter(p=>p.active&&p.availability!=='disponible'); const attendance=nextSession?Object.values(nextSession.attendance).filter(a=>a==='présent').length:0
 if (data.players.length === 0) return <><section className="welcome"><div><p className="eyebrow">BONJOUR, {firstName.toLocaleUpperCase('fr-FR')}</p><h2>Commençons par le groupe.</h2><p>Ajoutez vos joueurs pour préparer les séances, convocations et compositions.</p></div><div className="ball">⚽</div></section><section className="first-steps"><p className="eyebrow">PREMIÈRE ÉTAPE</p><h3>Ajoutez votre premier joueur</h3><p>Renseignez son nom, numéro et poste. Vous pourrez compléter l’effectif ensuite.</p><button className="primary" onClick={()=>go('effectif')}>Ajouter un joueur</button></section></>
 return <><section className="welcome"><div><p className="eyebrow">BONJOUR, {firstName.toLocaleUpperCase('fr-FR')}</p><h2>Prêt pour la séance ?</h2><p>Gardez le groupe concentré, une décision à la fois.</p></div><div className="ball">⚽</div></section>
 <div className="section-title"><h3>À venir</h3><button onClick={()=>go('matchs')}>Voir tout</button></div>
 <div className="schedule-grid">
  <article className="next-card session"><span className="card-icon">↗</span><p>PROCHAINE SÉANCE</p><h3>{nextSession?.title||'Aucune séance'}</h3><strong>{nextSession?`${formatDate(nextSession.date)} · ${nextSession.time}`:'Créez votre première séance'}</strong><div className="card-footer"><span>{attendance}/{data.players.filter(p=>p.active).length} réponses</span><button onClick={()=>go('présences')}>Présences →</button></div></article>
  <article className="next-card match"><span className="card-icon">◉</span><p>PROCHAIN MATCH</p><h3>{nextMatch?.home?'vs ':'@ '}{nextMatch?.opponent||'À planifier'}</h3><strong>{nextMatch?`${formatDate(nextMatch.date)} · ${nextMatch.time}`:'Ajoutez une rencontre'}</strong><div className="card-footer"><span>{nextMatch?.venue||'—'}</span><button onClick={()=>{if(nextMatch)setMatch(nextMatch.id);go('tactique')}}>Composer →</button></div></article>
 </div>
 <div className="section-title"><h3>Groupe du jour</h3><button onClick={()=>go('effectif')}>Effectif</button></div>
 <div className="metric-row"><Metric value={data.players.filter(p=>p.active).length} label="joueurs actifs" tone="dark"/><Metric value={unavailable.length} label="indisponibles" tone={unavailable.length?'orange':'green'}/><Metric value={`${Math.round(attendance/Math.max(1,data.players.length)*100)}%`} label="présents séance" tone="lime"/></div>
 {unavailable.length>0&&<section className="availability"><div className="section-title"><h3>À surveiller</h3><span className="count">{unavailable.length}</span></div>{unavailable.map(p=><div className="person-row" key={p.id}><span className="mini-avatar">{initials(p)}</span><div><strong>{fullName(p)}</strong><small>{p.mainPosition} · {playerNumber(p)}</small></div><span className={`status ${p.availability}`}>{p.availability}</span></div>)}</section>}
 </>
}
function Metric({value,label,tone}:{value:string|number;label:string;tone:string}) { return <div className={`metric ${tone}`}><strong>{value}</strong><span>{label}</span></div> }
function Roster({category,players,onAdd,onEdit}:{category:string;players:Player[];onAdd:()=>void;onEdit:(p:Player)=>void}) {
 const [query,setQuery]=useState('')
 const [filter,setFilter]=useState<RosterFilter>('tous')
 const visible=players.filter(player=>fullName(player).toLowerCase().includes(query.toLowerCase())&&(filter==='tous'||playerGroup(player.mainPosition)===filter)).sort((a,b)=>(a.number??Infinity)-(b.number??Infinity)||fullName(a).localeCompare(fullName(b)))
 const filters: Array<[RosterFilter,string]>=[['tous','Tous'],['gardiens','Gardiens'],['défenseurs','Défenseurs'],['milieux','Milieux'],['attaquants','Attaquants']]
 return <><div className="page-heading"><div><p className="eyebrow">GROUPE {category}</p><h2>L’effectif</h2><p>{filter==='tous'?`${players.length} joueurs actifs`:`${visible.length} ${filter}`}</p></div><button className="primary round" onClick={onAdd} aria-label="Ajouter un joueur">＋</button></div><label className="search">⌕<input placeholder="Rechercher un joueur" value={query} onChange={e=>setQuery(e.target.value)}/></label><div className="roster-filters" aria-label="Filtrer l’effectif">{filters.map(([id,label])=><button key={id} className={filter===id?'selected':''} onClick={()=>setFilter(id)}>{label}</button>)}</div><div className="roster-list">{visible.map(player=><article className="player-card" key={player.id} onClick={()=>onEdit(player)}><div className="jersey">{player.number??'—'}</div><div className="player-info"><h3>{fullName(player)}</h3><p>{player.mainPosition}{player.secondaryPosition?` · ${player.secondaryPosition}`:''}</p></div><span className={`dot ${player.availability}`}/></article>)}{visible.length===0&&<p className="roster-empty">Aucun joueur ne correspond à ce filtre.</p>}</div></> }

function AttendanceView({data,selected,setSelected,newSession,update}:{data:AppData;selected:string;setSelected:(x:string)=>void;newSession:()=>void;update:(fn:(d:AppData)=>AppData)=>void}) {
 const [period,setPeriod]=useState('all')
 const players=data.players.filter(player=>player.active)
 const orderedSessions=useMemo(()=>[...data.sessions].sort((a,b)=>`${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)),[data.sessions])
 const months=Array.from(new Set(orderedSessions.map(session=>session.date.slice(0,7)))).reverse()
 const periodSessions=period==='all'?orderedSessions:orderedSessions.filter(session=>session.date.startsWith(period))
 const session=data.sessions.find(item=>item.id===selected)
 const counts=useMemo(()=>{const result:Record<Attendance,number>={présent:0,absent:0,blessé:0,excusé:0};Object.values(session?.attendance||{}).forEach(status=>result[status]++);return result},[session])
 const change=(id:string,status:Attendance)=>update(current=>({...current,sessions:current.sessions.map(item=>item.id===selected?{...item,attendance:{...item.attendance,[id]:status}}:item)}))
 const choosePeriod=(value:string)=>{setPeriod(value);setSelected('')}
 return <><div className="page-heading"><div><p className="eyebrow">ORGANISATION</p><h2>Présences</h2><p>{session?'Renseignez la séance sélectionnée':'Vue d’ensemble du groupe'}</p></div><div className="attendance-actions">{session&&<button className="secondary" onClick={()=>setSelected('')}>Récap</button>}<button className="primary" onClick={newSession}>Nouvelle</button></div></div><label className="period-filter"><span>Période</span><select value={period} onChange={event=>choosePeriod(event.target.value)}><option value="all">Toutes les séances</option>{months.map(month=><option key={month} value={month}>{formatMonth(month)}</option>)}</select></label>{periodSessions.length>0&&<><div className="session-picker">{[...periodSessions].reverse().map(item=><button className={item.id===selected?'selected':''} key={item.id} onClick={()=>setSelected(item.id)}><strong>{formatDate(item.date)}</strong><span>{item.title}</span></button>)}</div><p className="helper">{session?'Touchez un statut pour le renseigner.':'Choisissez une séance pour renseigner les présences.'}</p></>}{session?<><section className="attendance-head"><div><h3>{session.title}</h3><p>{formatDate(session.date)} · {session.time}</p></div><div className="present-score"><b>{counts.présent}</b>/{players.length}<small>présents</small></div></section><div className="attendance-summary">{(['présent','absent','blessé','excusé'] as Attendance[]).map(status=><span key={status} className={status}>{counts[status]} {status}</span>)}</div><div className="attendance-list">{players.map(player=>{const current=session.attendance[player.id];return <article key={player.id}><span className="mini-avatar">{initials(player)}</span><div className="player-info"><strong>{fullName(player)}</strong><small>{playerNumber(player)} · {player.mainPosition}</small></div><div className="status-options">{(['présent','absent','blessé','excusé'] as Attendance[]).map(status=><button key={status} aria-label={status} title={status} onClick={()=>change(player.id,status)} className={`${status} ${current===status?'chosen':''}`}>{status==='présent'?'✓':status==='absent'?'—':status==='blessé'?'＋':'E'}</button>)}</div></article>})}</div></>:<AttendanceOverview players={players} sessions={periodSessions}/>}</> }

function AttendanceOverview({players,sessions}:{players:Player[];sessions:Session[]}) {
 const latestSessions=sessions.slice(-6)
 const answered=sessions.flatMap(session=>Object.values(session.attendance)).length
 const present=sessions.reduce((total,session)=>total+Object.values(session.attendance).filter(status=>status==='présent').length,0)
 const rate=answered?Math.round(present/answered*100):0
 if(sessions.length===0) return <section className="attendance-empty"><h3>Aucune séance sur cette période</h3><p>Créez une séance pour commencer le suivi des présences.</p></section>
 return <><section className="attendance-overview"><div><p className="eyebrow">TENDANCE DU GROUPE</p><h3>{rate}% de présence</h3><p>{present} présence{present!==1?'s':''} renseignée{present!==1?'s':''} sur {answered} réponse{answered!==1?'s':''}.</p></div><span>{sessions.length}<small>séances</small></span></section><div className="attendance-legend"><span><i className="attendance-dot présent"/>présent</span><span><i className="attendance-dot absent"/>absent</span><span><i className="attendance-dot pending"/>non renseigné</span></div><section className="attendance-history"><div className="section-title"><h3>Suivi des joueurs</h3><span>6 dernières séances</span></div>{players.map(player=>{const statuses=latestSessions.map(session=>session.attendance[player.id]);const known=statuses.filter((status):status is Attendance=>Boolean(status));const playerPresent=known.filter(status=>status==='présent').length;const playerRate=known.length?Math.round(playerPresent/known.length*100):0;return <article key={player.id}><span className="mini-avatar">{initials(player)}</span><div className="player-info"><strong>{fullName(player)}</strong><small>{playerPresent} présent{playerPresent!==1?'s':''} · {playerRate}%</small></div><div className="attendance-dots" aria-label={`Historique de ${fullName(player)}`}>{statuses.map((status,index)=><i key={`${latestSessions[index].id}-${player.id}`} className={`attendance-dot ${status||'pending'}`} title={`${formatDate(latestSessions[index].date)} : ${status||'non renseigné'}`}/>)}</div></article>})}</section></>
}

function MatchesView({data,activeMatch,setActiveMatch,newMatch,duplicateMatch}:{data:AppData;activeMatch:string;setActiveMatch:(x:string)=>void;newMatch:()=>void;duplicateMatch:(match:Match)=>void}) {
 const [statusFilter,setStatusFilter]=useState<'upcoming'|'completed'|'all'>('upcoming')
 const [locationFilter,setLocationFilter]=useState<'all'|'home'|'away'>('all')
 const openMatch=(id:string)=>setActiveMatch(id)
 const upcoming=[...data.matches].filter(match=>!match.completed).sort((a,b)=>`${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))
 const nextMatch=upcoming[0]
 const visible=[...data.matches].filter(match=>(statusFilter==='all'||(statusFilter==='upcoming'?!match.completed:match.completed))&&(locationFilter==='all'||(locationFilter==='home'?match.home:!match.home))).sort((a,b)=>`${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))
 const groups=visible.reduce<Array<{month:string;matches:Match[]}>>((result,match)=>{const month=match.date.slice(0,7);const group=result.find(item=>item.month===month);if(group)group.matches.push(match);else result.push({month,matches:[match]});return result},[])
 const preparation=(match:Match)=>{const starters=Object.values(match.lineup).length;if(match.completed)return 'Bilan enregistré';if(match.lineupValidated)return 'Feuille validée';if(!match.calledUp.length)return 'Convocation à préparer';return `${match.calledUp.length} convoqués · ${starters}/11 titulaires`}
 return <><div className="page-heading"><div><p className="eyebrow">CALENDRIER</p><h2>Matchs</h2></div><button className="primary" onClick={newMatch}>＋ Créer</button></div>{nextMatch&&<button className="next-match-banner" onClick={()=>openMatch(nextMatch.id)}><span><small>PROCHAIN MATCH</small><strong>vs {nextMatch.opponent}</strong><em>{formatDate(nextMatch.date)} · {nextMatch.time}</em></span><b>Préparer ›</b></button>}<div className="match-tabs" aria-label="Statut des matchs">{([['upcoming','À venir'],['completed','Terminés'],['all','Tous']] as const).map(([id,label])=><button key={id} className={statusFilter===id?'selected':''} onClick={()=>setStatusFilter(id)}>{label}</button>)}</div><div className="match-filters" aria-label="Lieu des matchs">{([['all','Tous lieux'],['home','Domicile'],['away','Extérieur']] as const).map(([id,label])=><button key={id} className={locationFilter===id?'selected':''} onClick={()=>setLocationFilter(id)}>{label}</button>)}</div><div className="matches-list">{groups.map(group=><section key={group.month} className="match-month"><div className="month-divider"><span>{formatMonth(group.month)}</span></div>{group.matches.map(match=><article className={`match-row ${match.id===activeMatch?'focus':''}`} key={match.id} onClick={()=>openMatch(match.id)}><time><b>{new Date(`${match.date}T12:00`).toLocaleDateString('fr-FR',{day:'2-digit'})}</b><span>{new Date(`${match.date}T12:00`).toLocaleDateString('fr-FR',{month:'short'}).replace('.','')}</span></time><div className="match-main"><small>{match.home?'DOMICILE':'EXTÉRIEUR'} · {match.time}</small><h3>{match.home?(data.team?.name||'Mon équipe'):match.opponent} <span>vs</span> {match.home?match.opponent:(data.team?.name||'Mon équipe')}</h3><p>⌖ {match.venue}</p><p className={`match-preparation ${match.lineupValidated?'ready':''}`}>{preparation(match)}</p></div><div className="match-action">{match.completed?<strong>{match.scoreHome}–{match.scoreAway}</strong>:<b>›</b>}<button className="match-duplicate" onClick={event=>{event.stopPropagation();duplicateMatch(match)}}>Dupliquer</button></div></article>)}</section>)}{visible.length===0&&<section className="match-empty"><h3>Aucun match à afficher</h3><p>Modifiez les filtres ou créez une nouvelle rencontre.</p></section>}</div></> }

function Tactics({teamName,match,players,update,notify,back,onDelete,report}:{teamName:string;match:Match;players:Player[];update:(fn:(d:AppData)=>AppData)=>void;notify:(message:string)=>void;back:()=>void;onDelete:()=>void;report:()=>void}) {
 const [selected,setSelected]=useState<string|null>(null)
 const [editing,setEditing]=useState(!match.lineupValidated)
 const slots=formSlots(match.formation)
 const unassigned=match.calledUp.filter(id=>!Object.values(match.lineup).includes(id))
 const occupied=Object.values(match.lineup)
 const assign=(slot:string)=>{if(!selected)return;update(d=>({...d,matches:d.matches.map(m=>{if(m.id!==match.id)return m;const lineup=Object.fromEntries(Object.entries(m.lineup).filter(([currentSlot,playerId])=>currentSlot===slot||playerId!==selected));return {...m,lineup:{...lineup,[slot]:selected},substitutes:m.substitutes.filter(x=>x!==selected),lineupValidated:false}})}));setSelected(null)}
 const remove=(slot:string)=>update(d=>({...d,matches:d.matches.map(m=>{if(m.id!==match.id)return m;const {[slot]:_removed,...lineup}=m.lineup;return {...m,lineup,lineupValidated:false}})}))
 const chooseSlot=(slot:string)=>{if(selected)assign(slot);else if(match.lineup[slot])remove(slot)}
 const changeFormation=(formation:Match['formation'])=>{if(formation===match.formation)return;update(d=>({...d,matches:d.matches.map(m=>m.id===match.id?{...m,formation,lineup:{},lineupValidated:false}:m)}));setSelected(null);notify('Formation modifiée : replacez les joueurs sur le terrain.')}
 const validate=()=>{if(occupied.length<11)return;update(d=>({...d,matches:d.matches.map(m=>m.id===match.id?{...m,lineupValidated:true}:m)}));setEditing(false);notify('Feuille de match validée. Vous pourrez encore la modifier si besoin.')}
 const selectPlayer=(id:string)=>setSelected(selected===id?null:id)
 const header=<div className="page-heading tactics-heading"><div><button className="back" onClick={back}>‹</button><p className="eyebrow">FEUILLE DE MATCH</p><h2>{match.home?`${teamName} vs ${match.opponent}`:`${match.opponent} vs ${teamName}`}</h2><p>{formatDate(match.date)} · {match.venue}</p></div><div className="tactics-actions"><button className="delete-match" onClick={onDelete}>Supprimer</button>{match.completed?<button className="primary" onClick={report}>Voir bilan</button>:<button className="primary" onClick={report}>Après-match</button>}</div></div>
 if(match.lineupValidated&&!editing)return <>{header}<ValidatedLineup match={match} players={players} onEdit={()=>setEditing(true)} /></>
 return <>{header}<div className="tactics-toolbar"><label>Formation <select className="formation-select" value={match.formation} onChange={event=>changeFormation(event.target.value as Match['formation'])}>{formations.map(formation=><option key={formation}>{formation}</option>)}</select></label><span><b>{occupied.length}</b>/11 titulaires</span></div><p className="helper">{selected ? `Sélection : ${shortName(players.find(p=>p.id===selected))}. Touchez un poste sur le terrain.` : 'Touchez un joueur pour le sélectionner. Touchez un joueur déjà placé pour le retirer.'}</p><Pitch formation={match.formation} slots={slots} lineup={match.lineup} players={players} selected={selected} onSlot={chooseSlot}/><div className="bench-section"><div className="section-title"><h3>{occupied.length<11?'Joueurs à placer':'Remplaçants'}</h3><span>{unassigned.length}</span></div><div className="player-chips">{unassigned.map(id=>{const p=players.find(x=>x.id===id);return p&&<button onClick={()=>selectPlayer(id)} className={selected===id?'selected':''} key={id}><span>{p.number??'—'}</span>{shortName(p)}</button>})}</div></div><div className="bench-section"><div className="section-title"><h3>Titulaires</h3><span>{occupied.length}</span></div><div className="lineup-list">{slots.filter(s=>match.lineup[s]).map(s=>{const p=players.find(x=>x.id===match.lineup[s]);return p&&<button key={s} onClick={()=>selectPlayer(p.id)}><span className="slot-label">{labelSlot(s)}</span><span>{p.number??'—'}</span>{shortName(p)}<i>×</i></button>})}</div></div><button disabled={occupied.length<11} className="confirm-lineup" onClick={validate}>✓ Valider la feuille de match</button></> }
function ValidatedLineup({match,players,onEdit}:{match:Match;players:Player[];onEdit:()=>void}) {const slots=formSlots(match.formation);const substitutes=match.calledUp.filter(id=>!Object.values(match.lineup).includes(id));return <section className="validated-lineup"><div className="validated-head"><div><p className="eyebrow">FEUILLE VALIDÉE</p><h3>{match.formation} · {Object.values(match.lineup).length}/11 titulaires</h3><p>La composition est enregistrée et reste modifiable.</p></div><span>✓</span></div><div className="validated-players">{slots.map(slot=>{const player=players.find(item=>item.id===match.lineup[slot]);return player&&<div key={slot}><small>{labelSlot(slot)}</small><strong>{shortName(player)}</strong></div>})}</div>{substitutes.length>0&&<p className="validated-subs">Remplaçants : {substitutes.map(id=>shortName(players.find(player=>player.id===id))).join(' · ')}</p>}<button className="save-button" onClick={onEdit}>Modifier la feuille</button></section>}
function Pitch({formation,slots,lineup,players,selected,onSlot}:{formation:Match['formation'];slots:string[];lineup:Record<string,string>;players:Player[];selected:string|null;onSlot:(s:string)=>void}) { const base:Record<string,string>={GB:'50% 88%',DD:'84% 72%',DC1:'61% 74%',DC2:'39% 74%',DG:'16% 72%',MDC1:'37% 57%',MDC2:'63% 57%',MD1:'37% 56%',MD2:'63% 56%',AD:'83% 39%',MOC:'50% 40%',AG:'17% 39%',BU:'50% 17%',BU1:'35% 18%',BU2:'65% 18%'};const threeFiveTwo:Record<string,string>={GB:'50% 88%',DC1:'25% 73%',DC2:'50% 75%',DC3:'75% 73%',PISTOND:'87% 56%',PISTONG:'13% 56%',MDC:'50% 58%',MC1:'36% 42%',MC2:'64% 42%',BU1:'35% 18%',BU2:'65% 18%'};const threeFourThree:Record<string,string>={GB:'50% 88%',DC1:'25% 73%',DC2:'50% 75%',DC3:'75% 73%',PISTOND:'85% 56%',MC1:'40% 53%',MC2:'60% 53%',PISTONG:'15% 56%',AD:'82% 25%',BU:'50% 17%',AG:'18% 25%'};const pos=formation==='3-5-2'?threeFiveTwo:formation==='3-4-3'?threeFourThree:base;return <div className="pitch"><div className="pitch-lines"/>{slots.map(slot=>{const player=players.find(item=>item.id===lineup[slot]);return <button key={slot} onClick={()=>onSlot(slot)} className={`pitch-player ${player?'filled':''} ${selected?'target':''}`} style={{left:pos[slot].split(' ')[0],top:pos[slot].split(' ')[1]}}><span>{player?player.number??'—':'+'}</span><small>{player?shortName(player):labelSlot(slot)}</small></button>})}</div> }

function Stats({data,onOpenPlayer}:{data:AppData;onOpenPlayer:(player:Player)=>void}) {
 const [ranking,setRanking]=useState<RankingMetric>('goals')
 const players=data.players.filter(player=>player.active)
 const events=data.matches.flatMap(match=>match.events)
 const stats=players.map(player=>{const attendance=data.sessions.reduce((total,session)=>total+(session.attendance[player.id]==='présent'?1:0),0);const attendanceAnswered=data.sessions.reduce((total,session)=>total+(session.attendance[player.id]?1:0),0);const selected=data.matches.reduce((total,match)=>total+(match.calledUp.includes(player.id)?1:0),0);const started=data.matches.reduce((total,match)=>total+(Object.values(match.lineup).includes(player.id)?1:0),0);const goals=events.filter(event=>event.playerId===player.id&&event.type==='but').length;const assists=events.filter(event=>event.playerId===player.id&&event.type==='passe').length;const cards=events.filter(event=>event.playerId===player.id&&['jaune','rouge'].includes(event.type)).length;return {player,attendance,attendanceAnswered,attendanceRate:attendanceAnswered?Math.round(attendance/attendanceAnswered*100):0,selected,started,goals,assists,cards,contributions:goals+assists}}).sort((a,b)=>b.goals-a.goals||b.started-a.started)
 const options:Array<{id:RankingMetric;label:string}>=[{id:'goals',label:'Buteurs'},{id:'assists',label:'Passeurs'},{id:'attendance',label:'Présence'},{id:'starts',label:'Titulaires'},{id:'contributions',label:'Contributions'},{id:'discipline',label:'Discipline'}]
 const rankingValue=(row:(typeof stats)[number])=>ranking==='attendance'?row.attendanceRate:ranking==='starts'?row.started:ranking==='contributions'?row.contributions:ranking==='discipline'?row.cards:row[ranking]
 const rankingLabel=(row:(typeof stats)[number])=>ranking==='goals'?`${row.goals} but${row.goals!==1?'s':''}`:ranking==='assists'?`${row.assists} passe${row.assists!==1?'s':''}`:ranking==='attendance'?`${row.attendanceRate}% · ${row.attendance}/${row.attendanceAnswered}`:ranking==='starts'?`${row.started} titularisation${row.started!==1?'s':''}`:ranking==='contributions'?`${row.contributions} action${row.contributions!==1?'s':''} décisive${row.contributions!==1?'s':''}`:`${row.cards} carton${row.cards!==1?'s':''}`
 const minimumResponses=Math.min(2,data.sessions.length)
 const ranked=stats.filter(row=>ranking==='attendance'?row.attendanceAnswered>=minimumResponses&&row.attendanceAnswered>0:rankingValue(row)>0).sort((a,b)=>rankingValue(b)-rankingValue(a)||fullName(a.player).localeCompare(fullName(b.player))).slice(0,5)
 return <><div className="page-heading"><div><p className="eyebrow">SAISON {data.team?.season || '—'}</p><h2>Statistiques</h2><p>Touchez un joueur pour voir son suivi détaillé.</p></div></div><section className="stat-hero"><div><b>{data.matches.filter(match=>match.completed).length}</b><span>matchs joués</span></div><div><b>{data.sessions.length}</b><span>séances</span></div><div><b>{Math.round(data.sessions.reduce((total,session)=>total+Object.values(session.attendance).filter(status=>status==='présent').length,0)/Math.max(1,data.sessions.length*players.length)*100)}%</b><span>présence</span></div></section><section className="rankings"><div className="section-title"><h3>Classements</h3><span>Individuels</span></div><div className="ranking-tabs">{options.map(option=><button key={option.id} className={ranking===option.id?'selected':''} onClick={()=>setRanking(option.id)}>{option.label}</button>)}</div>{ranked.length>0?<ol className="ranking-list">{ranked.map(row=>{const value=rankingValue(row);const place=ranked.findIndex(item=>rankingValue(item)===value)+1;return <li key={row.player.id}><span className={`ranking-place place-${place}`}>{place}</span><button onClick={()=>onOpenPlayer(row.player)}><span className="table-number">{row.player.number??'—'}</span><strong>{shortName(row.player)}</strong><small>{row.player.mainPosition}</small></button><b>{rankingLabel(row)}</b></li>})}</ol>:<p className="ranking-empty">Pas encore de données pour ce classement.</p>}</section><div className="table-wrap"><table><thead><tr><th>Joueur</th><th>Prés.</th><th>M.</th><th>Tit.</th><th>⚽</th><th>PD</th><th>▰</th></tr></thead><tbody>{stats.map(({player,attendance,selected,started,goals,assists,cards})=><tr key={player.id}><td><button className="player-stat-link" onClick={()=>onOpenPlayer(player)} aria-label={`Voir les statistiques de ${fullName(player)}`}><span className="table-number">{player.number??'—'}</span>{shortName(player)}<span>›</span></button></td><td>{attendance}/{data.sessions.length}</td><td>{selected}</td><td>{started}</td><td>{goals}</td><td>{assists}</td><td>{cards||'—'}</td></tr>)}</tbody></table></div></> }

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
  return <Sheet title="Fiche joueur" close={onClose}><section className="player-detail-hero"><div className="detail-jersey">{player.number??'—'}</div><div><p className="eyebrow">{player.mainPosition}{player.secondaryPosition?` · ${player.secondaryPosition}`:''}</p><h3>{fullName(player)}</h3><span className={`status ${player.availability}`}>{player.availability}</span></div></section><section className="player-kpis"><div><b>{attendanceRate}%</b><span>présence</span></div><div><b>{matches.length}</b><span>matchs</span></div><div><b>{started}</b><span>titularisations</span></div><div><b>{goals + assists}</b><span>actions décisives</span></div></section><section className="detail-section"><div className="detail-heading"><h3>Entraînements</h3><span>{present}/{sessions.length} présents</span></div>{sessions.length===0?<p className="detail-empty">Aucune séance enregistrée.</p>:<div className="detail-list">{sessions.map(session=>{const status=session.attendance[player.id]||'non renseigné';return <article key={session.id}><div><strong>{session.title}</strong><small>{formatDate(session.date)} · {session.time}</small></div><span className={`attendance-tag ${status}`}>{status}</span></article>})}</div>}</section><section className="detail-section"><div className="detail-heading"><h3>Matchs</h3><span>{goals} but{goals!==1?'s':''} · {assists} PD · {cards} carton{cards!==1?'s':''}</span></div>{matches.length===0?<p className="detail-empty">Aucun match pour ce joueur.</p>:<div className="detail-list">{matches.map(match=>{const isStarter=Object.values(match.lineup).includes(player.id);const matchEvents=match.events.filter(event=>event.playerId===player.id);const score=match.completed?`${data.team?.name||'Mon équipe'} ${match.scoreHome??0}–${match.scoreAway??0} ${match.opponent}`:'À venir';return <article key={match.id}><div><strong>vs {match.opponent}</strong><small>{formatDate(match.date)} · {isStarter?'Titulaire':'Convoqué'} · {score}</small>{matchEvents.length>0&&<small className="event-summary">{matchEvents.map(event=>event.type==='but'?'⚽ but':event.type==='passe'?'PD passe':event.type==='jaune'?'▰ jaune':event.type==='rouge'?'▰ rouge':event.type).join(' · ')}</small>}</div><span className={`match-role ${isStarter?'starter':''}`}>{isStarter?'Titulaire':'Convoqué'}</span></article>})}</div>}</section></Sheet>
}

function PlayerSheet({player,onClose,onSave,onDeactivate}:{player?:Player;onClose:()=>void;onSave:(p:Player)=>void;onDeactivate?:()=>void}) { const [p,setP]=useState<Player>(player||{id:uid(),firstName:'',lastName:'',mainPosition:'MC',availability:'disponible',active:true});const set=(field:keyof Player,value:string|number)=>setP(x=>({...x,[field]:value}));return <Sheet title={player?'Modifier le joueur':'Nouveau joueur'} close={onClose}><div className="form-grid"><Field label="Prénom"><input autoFocus value={p.firstName} onChange={e=>set('firstName',e.target.value)}/></Field><Field label="Nom"><input value={p.lastName} onChange={e=>set('lastName',e.target.value)}/></Field><Field label="Numéro (facultatif)"><input type="number" min="1" max="99" value={p.number??''} onChange={e=>setP(current=>({...current,number:e.target.value?Number(e.target.value):undefined}))}/></Field><Field label="Statut"><select value={p.availability} onChange={e=>set('availability',e.target.value as Availability)}><option value="disponible">Disponible</option><option value="indisponible">Indisponible</option><option value="blessé">Blessé</option></select></Field><Field label="Poste principal"><select value={p.mainPosition} onChange={e=>set('mainPosition',e.target.value)}>{positions.map(x=><option key={x}>{x}</option>)}</select></Field><Field label="Poste secondaire"><select value={p.secondaryPosition||''} onChange={e=>set('secondaryPosition',e.target.value)}><option value="">Aucun</option>{positions.map(x=><option key={x}>{x}</option>)}</select></Field></div><button disabled={!p.firstName||!p.lastName} className="save-button" onClick={()=>onSave(p)}>Enregistrer le joueur</button>{onDeactivate&&<button className="deactivate-player" onClick={onDeactivate}>Retirer de l’effectif</button>}</Sheet> }
function SessionSheet({onClose,onSave}:{onClose:()=>void;onSave:(s:Session)=>void}) {const now=new Date();const [title,setTitle]=useState('Entraînement');const [date,setDate]=useState(now.toISOString().slice(0,10));const [time,setTime]=useState('18:30');return <Sheet title="Nouvelle séance" close={onClose}><Field label="Intitulé"><input value={title} onChange={e=>setTitle(e.target.value)}/></Field><div className="form-grid"><Field label="Date"><input type="date" value={date} onChange={e=>setDate(e.target.value)}/></Field><Field label="Heure"><input type="time" value={time} onChange={e=>setTime(e.target.value)}/></Field></div><button className="save-button" onClick={()=>onSave({id:uid(),title,date,time,attendance:{}})}>Créer la séance</button></Sheet> }
function MatchSheet({players,template,onClose,onSave}:{players:Player[];template?:Match;onClose:()=>void;onSave:(m:Match)=>void}) {const now=new Date();const [opponent,setOpponent]=useState('');const [date,setDate]=useState(now.toISOString().slice(0,10));const [time,setTime]=useState(template?.time||'15:00');const [venue,setVenue]=useState(template?.venue||'Stade des Cèdres');const [home,setHome]=useState(template?.home??true);const available=players.filter(p=>p.availability==='disponible');const [calledUp,setCalledUp]=useState<string[]>([]);const toggle=(id:string)=>setCalledUp(x=>x.includes(id)?x.filter(v=>v!==id):[...x,id]);return <Sheet title={template?'Dupliquer un match':'Créer un match'} close={onClose}>{template&&<p className="match-template-note">Créé à partir de {template.opponent} : renseignez une nouvelle date et un nouvel adversaire.</p>}<Field label="Adversaire"><input autoFocus placeholder="Ex. AS Montchat" value={opponent} onChange={e=>setOpponent(e.target.value)}/></Field><div className="form-grid"><Field label="Date"><input type="date" value={date} onChange={e=>setDate(e.target.value)}/></Field><Field label="Heure"><input type="time" value={time} onChange={e=>setTime(e.target.value)}/></Field></div><Field label="Lieu"><input value={venue} onChange={e=>setVenue(e.target.value)}/></Field><div className="toggle-choice"><button className={home?'active':''} onClick={()=>setHome(true)}>Domicile</button><button className={!home?'active':''} onClick={()=>setHome(false)}>Extérieur</button></div><div className="callup-head"><strong>Convoqués</strong><span>{calledUp.length} sélectionnés</span></div><div className="callup-list">{available.map(p=><button key={p.id} onClick={()=>toggle(p.id)} className={calledUp.includes(p.id)?'checked':''}><span>{calledUp.includes(p.id)?'✓':'+'}</span><b>{playerNumber(p)}</b>{fullName(p)}</button>)}</div><button disabled={!opponent||calledUp.length<11} className="save-button" onClick={()=>onSave({id:uid(),opponent,date,time,venue,home,calledUp,formation:'4-2-3-1',lineup:{},substitutes:[],events:[]})}>{template?'Dupliquer et préparer la compo':'Créer et préparer la compo'}</button></Sheet> }
function ReportSheet({teamName,match,players,onClose,onSave}:{teamName:string;match:Match;players:Player[];onClose:()=>void;onSave:(m:Match)=>void}) {const [home,setHome]=useState(match.scoreHome?.toString()||'');const [away,setAway]=useState(match.scoreAway?.toString()||'');const [summary,setSummary]=useState(match.summary||'');const [events,setEvents]=useState<MatchEvent[]>(match.events);const add=(type:MatchEvent['type'])=>setEvents(x=>[...x,{id:uid(),type,playerId:match.calledUp[0]||players[0].id,minute:undefined}]);return <Sheet title="Après-match" close={onClose}><div className="score-form"><div><label>{teamName}</label><input inputMode="numeric" value={home} onChange={e=>setHome(e.target.value)}/></div><b>—</b><div><label>{match.opponent}</label><input inputMode="numeric" value={away} onChange={e=>setAway(e.target.value)}/></div></div><div className="event-head"><h3>Événements</h3><div>{(['but','passe','jaune','rouge'] as MatchEvent['type'][]).map(t=><button key={t} onClick={()=>add(t)}>+ {t}</button>)}</div></div>{events.map((e,i)=><div className="event-row" key={e.id}><select value={e.type} onChange={ev=>setEvents(x=>x.map((a,j)=>j===i?{...a,type:ev.target.value as MatchEvent['type']}:a))}><option value="but">But</option><option value="passe">Passe</option><option value="jaune">Carton jaune</option><option value="rouge">Carton rouge</option><option value="entrée">Entrée</option><option value="sortie">Sortie</option></select><select value={e.playerId} onChange={ev=>setEvents(x=>x.map((a,j)=>j===i?{...a,playerId:ev.target.value}:a))}>{match.calledUp.map(id=>{const p=players.find(x=>x.id===id);return p&&<option key={id} value={id}>{playerNumber(p)} · {fullName(p)}</option>})}</select><input placeholder="min." type="number" value={e.minute||''} onChange={ev=>setEvents(x=>x.map((a,j)=>j===i?{...a,minute:Number(ev.target.value)}:a))}/><button onClick={()=>setEvents(x=>x.filter((_,j)=>j!==i))}>×</button></div>)}<Field label="Commentaire global"><textarea placeholder="Ce qui a fonctionné, axes de progrès..." value={summary} onChange={e=>setSummary(e.target.value)}/></Field><button className="save-button" onClick={()=>onSave({...match,scoreHome:Number(home||0),scoreAway:Number(away||0),summary,events,completed:true})}>Enregistrer le bilan</button></Sheet> }
function Sheet({title,close,children}:{title:string;close:()=>void;children:React.ReactNode}) {
  const [closing,setClosing]=useState(false)
  const panel=useRef<HTMLElement>(null)
  const closeRef=useRef(close)
  const previousFocus=useRef(document.activeElement instanceof HTMLElement?document.activeElement:null)
  const titleId=useId()
  closeRef.current=close
  const requestClose=()=>setClosing(true)

  useEffect(()=>{
    const overflow=document.body.style.overflow
    document.body.style.overflow='hidden'
    if (!panel.current?.contains(document.activeElement)) panel.current?.focus({preventScroll:true})
    const handleKey=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();setClosing(true)}
      if(event.key!=='Tab'||!panel.current)return
      const focusable=Array.from(panel.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')).filter(item=>item.getClientRects().length)
      const first=focusable[0],last=focusable[focusable.length-1]
      if(!first){event.preventDefault();return}
      if(event.shiftKey&&(document.activeElement===first||document.activeElement===panel.current)){event.preventDefault();last.focus()}
      else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===panel.current)){event.preventDefault();first.focus()}
    }
    document.addEventListener('keydown',handleKey)
    return ()=>{
      document.body.style.overflow=overflow
      document.removeEventListener('keydown',handleKey)
      if(previousFocus.current?.isConnected)previousFocus.current.focus({preventScroll:true})
    }
  },[])
  useEffect(()=>{
    if(!closing)return
    const delay=window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:180
    const timer=window.setTimeout(()=>closeRef.current(),delay)
    return ()=>window.clearTimeout(timer)
  },[closing])
  return <div className={`sheet-backdrop${closing?' is-closing':''}`} onMouseDown={event=>{if(event.target===event.currentTarget)requestClose()}}><section ref={panel} className="sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}><div className="sheet-handle"/><header><h2 id={titleId}>{title}</h2><button onClick={requestClose} aria-label="Fermer">×</button></header>{children}</section></div>
}
function Field({label,children}:{label:string;children:React.ReactNode}) {return <label className="field"><span>{label}</span>{children}</label>}
function formatDate(date:string) {return new Date(`${date}T12:00`).toLocaleDateString('fr-FR',{weekday:'short',day:'numeric',month:'short'}).replace('.','')}
function formatMonth(month:string) {return new Date(`${month}-01T12:00`).toLocaleDateString('fr-FR',{month:'long',year:'numeric'})}

createRoot(document.getElementById('root')!).render(<App />)
