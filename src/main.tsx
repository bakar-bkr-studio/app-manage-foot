import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { EmailAuthProvider, browserLocalPersistence, createUserWithEmailAndPassword, linkWithCredential, onIdTokenChanged, sendPasswordResetEmail, setPersistence, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth'
import { cloudRepository, emptyAppData, repository } from './data'
import { dataMode, firebaseAuth, firebaseConfigured } from './firebase'
import { MotionPage } from './motion'
import { AccountPage, ProfileForm, TeamForm } from './account'
import { ChampionshipPage } from './ChampionshipPage'
import { Dashboard } from './Dashboard'
import { TrainingPreparationView } from './TrainingPreparation'
import { duplicateSession, localDay } from './training'
import { addMatchWithChampionship, applyMatchResult, orderedRounds, statsThroughRound, type MatchChampionshipLink } from './championship'
import type { AppData, Attendance, Availability, CoachProfile, Match, MatchEvent, MatchType, Player, Position, Session, TeamProfile, TeamRecord } from './types'
import './styles.css'
import './callups.css'
import './auth.css'
import './stats.css'
import './tactics.css'
import './roster.css'
import './attendance.css'
import './matches.css'
import './motion.css'
import './league-layout.css'
import './match-categories.css'

type View = 'accueil'|'effectif'|'présences'|'matchs'|'tactique'|'championnat'|'stats'|'profil'
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
const matchTypeLabel = (match:Match) => match.championshipFixtureId||match.matchType==='championnat'?'Championnat':match.matchType==='coupe'?'Coupe':match.matchType==='amical'?'Amical':'Type non précisé'
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
  const [sheet, setSheet] = useState<'player'|'session'|'match'|'match-edit'|'report'|'player-stats'|null>(null)
  const [activeSession, setActiveSession] = useState<string>('')
  const [sessionTemplate,setSessionTemplate]=useState<Session | undefined>()
  const [activeMatch, setActiveMatch] = useState<string>(() => data.matches[0]?.id || '')
  const [editPlayer, setEditPlayer] = useState<Player | undefined>()
  const [matchTemplate, setMatchTemplate] = useState<Match | undefined>()
  const [statsPlayer, setStatsPlayer] = useState<Player | undefined>()
  const [statsPlayerData, setStatsPlayerData] = useState<AppData | undefined>()
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
      {view==='accueil' && <Dashboard data={data} firstName={profile.firstName} go={view=>{if(view==='présences')setActiveSession('');setView(view)}} newSession={()=>{setActiveSession('');setSessionTemplate(undefined);setView('présences');setSheet('session')}} openSession={session=>{setActiveSession(session.id);setView('présences')}} openMatch={match=>{setActiveMatch(match.id);setView('tactique')}} openReport={match=>{setActiveMatch(match.id);setView('tactique');setSheet('report')}} openPlayer={player=>{setStatsPlayer(player);setStatsPlayerData(data);setSheet('player-stats')}} />}
      {view==='effectif' && <Roster category={data.team?.category || 'U18'} players={activePlayers} onAdd={()=>{setEditPlayer(undefined);setSheet('player')}} onEdit={p=>{setEditPlayer(p);setSheet('player')}} />}
      {view==='présences' && <AttendanceView data={data} selected={activeSession} setSelected={setActiveSession} newSession={()=>{setSessionTemplate(undefined);setSheet('session')}} duplicateSession={session=>{setSessionTemplate(session);setSheet('session')}} update={update} />}
      {view==='matchs' && <MatchesView data={data} activeMatch={activeMatch} setActiveMatch={id=>{setActiveMatch(id);setView('tactique')}} newMatch={()=>{setMatchTemplate(undefined);setSheet('match')}} duplicateMatch={match=>{setMatchTemplate(match);setSheet('match')}} />}
      {view==='tactique' && match && <Tactics teamName={data.team?.name || data.team?.category || 'Mon équipe'} match={match} players={activePlayers} update={update} notify={notify} back={()=>setView('matchs')} edit={()=>setSheet('match-edit')} onDelete={()=>{if(window.confirm(`Supprimer le match contre ${match.opponent} et son bilan ? Cette action est irréversible.${match.championshipFixtureId?' La rencontre restera dans le championnat, sans lien vers ce match.':''}`)){update(current=>({...current,matches:current.matches.filter(item=>item.id!==match.id),championships:current.championships?.map(championship=>({...championship,rounds:championship.rounds.map(round=>({...round,fixtures:round.fixtures.map(fixture=>{if(fixture.matchId!==match.id)return fixture;const {matchId:_matchId,...rest}=fixture;return rest})}))}))}));setActiveMatch('');setView('matchs');notify('Match supprimé')}}} report={()=>setSheet('report')} />}
      {view==='championnat' && <ChampionshipPage data={data} update={update} onOpenMatch={id=>{setActiveMatch(id);setView('tactique')}} />}
      {view==='stats' && <Stats data={data} onOpenPlayer={(player,filteredData)=>{setStatsPlayer(player);setStatsPlayerData(filteredData);setSheet('player-stats')}} />}
      {view==='profil' && <AccountPage user={user} profile={profile} teams={teams} activeTeamId={active.id} onSaveProfile={saveProfile} onSaveTeam={async(id,team)=>{const record=teams.find(item=>item.id===id);if(!record)throw new Error('Équipe introuvable');await saveTeamData(id,{...record.data,team,championships:record.data.championships?.map(championship=>({...championship,teams:championship.teams.map(item=>item.own?{...item,name:team.name}:item)}))})}} onCreateTeam={createTeam} onSwitch={selectTeam} onBack={()=>setView('accueil')} onSignOut={logout}/>}
      </MotionPage>
    </section>
    <nav className="bottom-nav" data-view={view} aria-label="Navigation principale">
      {([['accueil','⌂','Accueil'],['effectif','♙','Effectif'],['présences','✓','Entraînements'],['matchs','◉','Matchs'],['championnat','♜','Championnat'],['stats','▥','Stats']] as [View,string,string][]).map(([id,icon,label])=><button key={id} className={(view==='tactique'?'matchs':view)===id?'active':''} aria-current={(view==='tactique'?'matchs':view)===id?'page':undefined} aria-label={label} onClick={()=>setView(id)}><span aria-hidden="true">{icon}</span>{label}</button>)}
    </nav>
    {toast && <div className="toast">{toast}</div>}
    {sheet==='player' && <PlayerSheet player={editPlayer} onClose={()=>setSheet(null)} onSave={player=>{update(d=>({...d,players: editPlayer ? d.players.map(p=>p.id===player.id?player:p) : [...d.players,player]}));setSheet(null);notify(editPlayer?'Joueur mis à jour':'Joueur ajouté')}} onDeactivate={editPlayer?()=>{if(window.confirm(`Retirer ${fullName(editPlayer)} de l’effectif ? Ses données historiques seront conservées.`)) {update(d=>({...d,players:d.players.map(item=>item.id===editPlayer.id?{...item,active:false}:item)}));setSheet(null);notify(`${fullName(editPlayer)} retiré de l’effectif`)}}:undefined} />}
    {sheet==='session' && <SessionSheet template={sessionTemplate} onClose={()=>{setSessionTemplate(undefined);setSheet(null)}} onSave={session=>{update(d=>({...d,sessions:[session,...d.sessions]}));setActiveSession(session.id);setSessionTemplate(undefined);setSheet(null);notify('Séance créée')}} />}
    {sheet==='match' && <MatchSheet data={data} players={activePlayers} template={matchTemplate} onClose={()=>{setMatchTemplate(undefined);setSheet(null)}} onSave={(newMatch,link)=>{try{const next=addMatchWithChampionship(dataRef.current,newMatch,link);update(()=>next);setActiveMatch(newMatch.id);setMatchTemplate(undefined);setSheet(null);setView('tactique');notify(link?'Match ajouté au championnat':'Match créé : préparez votre composition');return ''}catch(reason){return reason instanceof Error?reason.message:'Impossible de créer le match.'}}} />}
    {sheet==='match-edit' && match && <MatchEditSheet match={match} players={activePlayers} onClose={()=>setSheet(null)} onSave={updated=>{update(current=>({...current,matches:current.matches.map(item=>item.id===updated.id?updated:item),championships:current.championships?.map(championship=>({...championship,rounds:championship.rounds.map(round=>({...round,fixtures:round.fixtures.map(fixture=>fixture.id===updated.championshipFixtureId&&fixture.matchId===updated.id&&updated.date!==match.date?{...fixture,date:updated.date}:fixture)}))}))}));setSheet(null);notify('Match mis à jour')}} />}
    {sheet==='report' && match && <ReportSheet teamName={data.team?.name || data.team?.category || 'Mon équipe'} match={match} players={activePlayers} onClose={()=>setSheet(null)} onSave={updated=>{update(d=>applyMatchResult(d,updated));setSheet(null);notify('Après-match enregistré')}} />}
    {sheet==='player-stats' && statsPlayer && <PlayerStatsSheet player={statsPlayer} data={statsPlayerData||data} onClose={()=>setSheet(null)} />}
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

function Roster({category,players,onAdd,onEdit}:{category:string;players:Player[];onAdd:()=>void;onEdit:(p:Player)=>void}) {
 const [query,setQuery]=useState('')
 const [filter,setFilter]=useState<RosterFilter>('tous')
 const visible=players.filter(player=>fullName(player).toLowerCase().includes(query.toLowerCase())&&(filter==='tous'||playerGroup(player.mainPosition)===filter)).sort((a,b)=>(a.number??Infinity)-(b.number??Infinity)||fullName(a).localeCompare(fullName(b)))
 const filters: Array<[RosterFilter,string]>=[['tous','Tous'],['gardiens','Gardiens'],['défenseurs','Défenseurs'],['milieux','Milieux'],['attaquants','Attaquants']]
 return <><div className="page-heading"><div><p className="eyebrow">GROUPE {category}</p><h2>L’effectif</h2><p>{filter==='tous'?`${players.length} joueurs actifs`:`${visible.length} ${filter}`}</p></div><button className="primary round" onClick={onAdd} aria-label="Ajouter un joueur">＋</button></div><label className="search">⌕<input placeholder="Rechercher un joueur" value={query} onChange={e=>setQuery(e.target.value)}/></label><div className="roster-filters" aria-label="Filtrer l’effectif">{filters.map(([id,label])=><button key={id} className={filter===id?'selected':''} onClick={()=>setFilter(id)}>{label}</button>)}</div><div className="roster-list">{visible.map(player=><article className="player-card" key={player.id} onClick={()=>onEdit(player)}><div className="jersey">{player.number??'—'}</div><div className="player-info"><h3>{fullName(player)}</h3><p>{player.mainPosition}{player.secondaryPosition?` · ${player.secondaryPosition}`:''}</p></div><span className={`dot ${player.availability}`}/></article>)}{visible.length===0&&<p className="roster-empty">Aucun joueur ne correspond à ce filtre.</p>}</div></> }

function AttendanceView({data,selected,setSelected,newSession,duplicateSession,update}:{data:AppData;selected:string;setSelected:(x:string)=>void;newSession:()=>void;duplicateSession:(session:Session)=>void;update:(fn:(d:AppData)=>AppData)=>void}) {
 const [sessionTab,setSessionTab]=useState<'attendance'|'preparation'>('attendance')
 const [period,setPeriod]=useState('all')
 const players=data.players.filter(player=>player.active)
 const orderedSessions=useMemo(()=>[...data.sessions].sort((a,b)=>`${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)),[data.sessions])
 const months=Array.from(new Set(orderedSessions.map(session=>session.date.slice(0,7)))).reverse()
 const periodSessions=period==='all'?orderedSessions:orderedSessions.filter(session=>session.date.startsWith(period))
 const session=data.sessions.find(item=>item.id===selected)
 const counts=useMemo(()=>{const result:Record<Attendance,number>={présent:0,absent:0,blessé:0,excusé:0};players.forEach(player=>{const status=session?.attendance[player.id];if(status)result[status]++});return result},[session,data.players])
 const change=(id:string,status:Attendance)=>update(current=>({...current,sessions:current.sessions.map(item=>item.id===selected?{...item,attendance:{...item.attendance,[id]:status}}:item)}))
 const choosePeriod=(value:string)=>{setPeriod(value);setSelected('')}
 return <><div className="page-heading"><div><p className="eyebrow">ORGANISATION</p><h2>Entraînements</h2><p>{session?'Séance sélectionnée':'Vue d’ensemble des présences'}</p></div><div className="attendance-actions">{session&&<button className="secondary" onClick={()=>setSelected('')}>Récap</button>}<button className="primary" onClick={newSession}>Nouvelle</button></div></div><label className="period-filter"><span>Période</span><select value={period} onChange={event=>choosePeriod(event.target.value)}><option value="all">Toutes les séances</option>{months.map(month=><option key={month} value={month}>{formatMonth(month)}</option>)}</select></label>{periodSessions.length>0&&<><div className="session-picker">{[...periodSessions].reverse().map(item=><button className={item.id===selected?'selected':''} key={item.id} onClick={()=>{setSessionTab('attendance');setSelected(item.id)}}><strong>{formatDate(item.date)}</strong><span>{item.title}</span></button>)}</div><p className="helper">{session?'Préparez votre séance ou renseignez les présences.':'Choisissez une séance pour renseigner les présences ou la préparer.'}</p></>}{session?<><div className="training-tabs" aria-label="Contenu de la séance"><button aria-pressed={sessionTab==='attendance'} className={sessionTab==='attendance'?'selected':''} onClick={()=>setSessionTab('attendance')}>Présences</button><button aria-pressed={sessionTab==='preparation'} className={sessionTab==='preparation'?'selected':''} onClick={()=>setSessionTab('preparation')}>Préparation</button><button className="training-duplicate" onClick={()=>duplicateSession(session)}>Dupliquer</button></div>{sessionTab==='preparation'?<TrainingPreparationView key={session.id} session={session} players={players} update={update}/>:<><section className="attendance-head"><div><h3>{session.title}</h3><p>{formatDate(session.date)} · {session.time}</p></div><div className="present-score"><b>{counts.présent}</b>/{players.length}<small>présents</small></div></section><div className="attendance-summary">{(['présent','absent','blessé','excusé'] as Attendance[]).map(status=><span key={status} className={status}>{counts[status]} {status}</span>)}<span>{players.length-Object.values(counts).reduce((sum,count)=>sum+count,0)} à renseigner</span></div><div className="attendance-list">{players.map(player=>{const current=session.attendance[player.id];return <article key={player.id}><span className="mini-avatar">{initials(player)}</span><div className="player-info"><strong>{fullName(player)}</strong><small>{playerNumber(player)} · {player.mainPosition}</small></div><div className="status-options">{(['présent','absent','blessé','excusé'] as Attendance[]).map(status=><button key={status} aria-label={status} title={status} onClick={()=>change(player.id,status)} className={`${status} ${current===status?'chosen':''}`}>{status==='présent'?'✓':status==='absent'?'—':status==='blessé'?'＋':'E'}</button>)}</div>{(current==='présent'||session.incidents?.[player.id])&&<TrainingIncident key={`${session.id}-${player.id}`} session={session} player={player} update={update}/>}</article>})}</div></>}</>:<AttendanceOverview players={players} sessions={periodSessions}/>}</> }

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
 return <><div className="page-heading"><div><p className="eyebrow">CALENDRIER</p><h2>Matchs</h2></div><button className="primary" onClick={newMatch}>＋ Créer</button></div>{nextMatch&&<button className="next-match-banner" onClick={()=>openMatch(nextMatch.id)}><span><small>PROCHAIN MATCH</small><strong>vs {nextMatch.opponent}</strong><em>{formatDate(nextMatch.date)} · {nextMatch.time||'Heure à définir'}</em></span><b>Préparer ›</b></button>}<div className="match-tabs" aria-label="Statut des matchs">{([['upcoming','À venir'],['completed','Terminés'],['all','Tous']] as const).map(([id,label])=><button key={id} className={statusFilter===id?'selected':''} onClick={()=>setStatusFilter(id)}>{label}</button>)}</div><div className="match-filters" aria-label="Lieu des matchs">{([['all','Tous lieux'],['home','Domicile'],['away','Extérieur']] as const).map(([id,label])=><button key={id} className={locationFilter===id?'selected':''} onClick={()=>setLocationFilter(id)}>{label}</button>)}</div><div className="matches-list">{groups.map(group=><section key={group.month} className="match-month"><div className="month-divider"><span>{formatMonth(group.month)}</span></div>{group.matches.map(match=><article className={`match-row ${match.home?'match-home':'match-away'} ${match.id===activeMatch?'focus':''}`} key={match.id} onClick={()=>openMatch(match.id)}><time><b>{new Date(`${match.date}T12:00`).toLocaleDateString('fr-FR',{day:'2-digit'})}</b><span>{new Date(`${match.date}T12:00`).toLocaleDateString('fr-FR',{month:'short'}).replace('.','')}</span></time><div className="match-main"><small><span className="match-location">{match.home?'DOMICILE':'EXTÉRIEUR'}</span> · {match.time||'Heure à définir'} · {matchTypeLabel(match)}</small><h3>{match.home?(data.team?.name||'Mon équipe'):match.opponent} <span>vs</span> {match.home?match.opponent:(data.team?.name||'Mon équipe')}</h3><p>⌖ {match.venue||'Lieu à définir'}</p><p className={`match-preparation ${match.lineupValidated?'ready':''}`}>{preparation(match)}</p></div><div className="match-action">{match.completed?<strong>{match.home?match.scoreHome:match.scoreAway}–{match.home?match.scoreAway:match.scoreHome}</strong>:<b>›</b>}<button className="match-duplicate" onClick={event=>{event.stopPropagation();duplicateMatch(match)}}>Dupliquer</button></div></article>)}</section>)}{visible.length===0&&<section className="match-empty"><h3>Aucun match à afficher</h3><p>Modifiez les filtres ou créez une nouvelle rencontre.</p></section>}</div></> }

function Tactics({teamName,match,players,update,notify,back,edit,onDelete,report}:{teamName:string;match:Match;players:Player[];update:(fn:(d:AppData)=>AppData)=>void;notify:(message:string)=>void;back:()=>void;edit:()=>void;onDelete:()=>void;report:()=>void}) {
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
 const header=<><div className="page-heading tactics-heading"><div><button className="back" onClick={back}>‹</button><p className="eyebrow">FEUILLE DE MATCH · {matchTypeLabel(match)}</p><h2>{match.home?`${teamName} vs ${match.opponent}`:`${match.opponent} vs ${teamName}`}</h2><p>{formatDate(match.date)}{match.time?` · ${match.time}`:''}{match.venue?` · ${match.venue}`:' · Lieu à renseigner'}</p></div><div className="tactics-actions"><button className="delete-match" onClick={onDelete}>Supprimer</button>{match.completed?<button className="primary" onClick={report}>Voir bilan</button>:<button className="primary" onClick={report}>Après-match</button>}</div></div><button className="league-outline match-edit-button" onClick={edit}>Modifier les informations et les convocations</button></>
 if(match.lineupValidated&&!editing)return <>{header}<ValidatedLineup match={match} players={players} onEdit={()=>setEditing(true)} /></>
 return <>{header}<div className="tactics-toolbar"><label>Formation <select className="formation-select" value={match.formation} onChange={event=>changeFormation(event.target.value as Match['formation'])}>{formations.map(formation=><option key={formation}>{formation}</option>)}</select></label><span><b>{occupied.length}</b>/11 titulaires</span></div><p className="helper">{selected ? `Sélection : ${shortName(players.find(p=>p.id===selected))}. Touchez un poste sur le terrain.` : 'Touchez un joueur pour le sélectionner. Touchez un joueur déjà placé pour le retirer.'}</p><Pitch formation={match.formation} slots={slots} lineup={match.lineup} players={players} selected={selected} onSlot={chooseSlot}/><div className="bench-section"><div className="section-title"><h3>{occupied.length<11?'Joueurs à placer':'Remplaçants'}</h3><span>{unassigned.length}</span></div><div className="player-chips">{unassigned.map(id=>{const p=players.find(x=>x.id===id);return p&&<button onClick={()=>selectPlayer(id)} className={selected===id?'selected':''} key={id}><span>{p.number??'—'}</span>{shortName(p)}</button>})}</div></div><div className="bench-section"><div className="section-title"><h3>Titulaires</h3><span>{occupied.length}</span></div><div className="lineup-list">{slots.filter(s=>match.lineup[s]).map(s=>{const p=players.find(x=>x.id===match.lineup[s]);return p&&<button key={s} onClick={()=>selectPlayer(p.id)}><span className="slot-label">{labelSlot(s)}</span><span>{p.number??'—'}</span>{shortName(p)}<i>×</i></button>})}</div></div><button disabled={occupied.length<11} className="confirm-lineup" onClick={validate}>✓ Valider la feuille de match</button></> }
function ValidatedLineup({match,players,onEdit}:{match:Match;players:Player[];onEdit:()=>void}) {const slots=formSlots(match.formation);const substitutes=match.calledUp.filter(id=>!Object.values(match.lineup).includes(id));return <section className="validated-lineup"><div className="validated-head"><div><p className="eyebrow">FEUILLE VALIDÉE</p><h3>{match.formation} · {Object.values(match.lineup).length}/11 titulaires</h3><p>La composition est enregistrée et reste modifiable.</p></div><span>✓</span></div><div className="validated-players">{slots.map(slot=>{const player=players.find(item=>item.id===match.lineup[slot]);return player&&<div key={slot}><small>{labelSlot(slot)}</small><strong>{shortName(player)}</strong></div>})}</div>{substitutes.length>0&&<p className="validated-subs">Remplaçants : {substitutes.map(id=>shortName(players.find(player=>player.id===id))).join(' · ')}</p>}<button className="save-button" onClick={onEdit}>Modifier la feuille</button></section>}
function Pitch({formation,slots,lineup,players,selected,onSlot}:{formation:Match['formation'];slots:string[];lineup:Record<string,string>;players:Player[];selected:string|null;onSlot:(s:string)=>void}) { const base:Record<string,string>={GB:'50% 88%',DD:'84% 72%',DC1:'61% 74%',DC2:'39% 74%',DG:'16% 72%',MDC1:'37% 57%',MDC2:'63% 57%',MD1:'37% 56%',MD2:'63% 56%',AD:'83% 39%',MOC:'50% 40%',AG:'17% 39%',BU:'50% 17%',BU1:'35% 18%',BU2:'65% 18%'};const threeFiveTwo:Record<string,string>={GB:'50% 88%',DC1:'25% 73%',DC2:'50% 75%',DC3:'75% 73%',PISTOND:'87% 56%',PISTONG:'13% 56%',MDC:'50% 58%',MC1:'36% 42%',MC2:'64% 42%',BU1:'35% 18%',BU2:'65% 18%'};const threeFourThree:Record<string,string>={GB:'50% 88%',DC1:'25% 73%',DC2:'50% 75%',DC3:'75% 73%',PISTOND:'85% 56%',MC1:'40% 53%',MC2:'60% 53%',PISTONG:'15% 56%',AD:'82% 25%',BU:'50% 17%',AG:'18% 25%'};const pos=formation==='3-5-2'?threeFiveTwo:formation==='3-4-3'?threeFourThree:base;return <div className="pitch"><div className="pitch-lines"/>{slots.map(slot=>{const player=players.find(item=>item.id===lineup[slot]);return <button key={slot} onClick={()=>onSlot(slot)} className={`pitch-player ${player?'filled':''} ${selected?'target':''}`} style={{left:pos[slot].split(' ')[0],top:pos[slot].split(' ')[1]}}><span>{player?player.number??'—':'+'}</span><small>{player?shortName(player):labelSlot(slot)}</small></button>})}</div> }

function Stats({data,onOpenPlayer}:{data:AppData;onOpenPlayer:(player:Player,filteredData:AppData)=>void}) {
 const [ranking,setRanking]=useState<RankingMetric>('goals')
 const championships=data.championships||[]
 const [championshipId,setChampionshipId]=useState(()=>championships.find(item=>item.season===data.team?.season)?.id||championships[0]?.id||'')
 const [roundId,setRoundId]=useState('')
 const championship=championships.find(item=>item.id===championshipId)
 const rounds=championship?orderedRounds(championship.rounds):[]
 const foundIndex=rounds.findIndex(round=>round.id===roundId)
 const index=foundIndex<0?rounds.length:foundIndex
 const selectedRound=rounds[index]
 const filteredData=championship&&selectedRound?statsThroughRound(data,championship,selectedRound.id):data
 const lastPlayed=rounds.reduce((last,round,i)=>round.fixtures.some(fixture=>fixture.homeScore!==undefined&&fixture.awayScore!==undefined)?i:last,-1)
 const previous=()=>{const next=index===rounds.length&&lastPlayed>=0?lastPlayed:index-1;if(rounds[next])setRoundId(rounds[next].id)}
 const next=()=>setRoundId(rounds[index+1]?.id||'')
 const players=filteredData.players.filter(player=>player.active)
 const events=filteredData.matches.flatMap(match=>match.events)
 const stats=players.map(player=>{const attendance=filteredData.sessions.reduce((total,session)=>total+(session.attendance[player.id]==='présent'?1:0),0);const attendanceAnswered=filteredData.sessions.reduce((total,session)=>total+(session.attendance[player.id]?1:0),0);const selected=filteredData.matches.reduce((total,match)=>total+(match.calledUp.includes(player.id)?1:0),0);const started=filteredData.matches.reduce((total,match)=>total+(Object.values(match.lineup).includes(player.id)?1:0),0);const goals=events.filter(event=>event.playerId===player.id&&event.type==='but').length;const assists=events.filter(event=>event.playerId===player.id&&event.type==='passe').length;const cards=events.filter(event=>event.playerId===player.id&&['jaune','rouge'].includes(event.type)).length;return {player,attendance,attendanceAnswered,attendanceRate:attendanceAnswered?Math.round(attendance/attendanceAnswered*100):0,selected,started,goals,assists,cards,contributions:goals+assists}}).sort((a,b)=>b.goals-a.goals||b.started-a.started)
 const options:Array<{id:RankingMetric;label:string}>=[{id:'goals',label:'Buteurs'},{id:'assists',label:'Passeurs'},{id:'attendance',label:'Présence'},{id:'starts',label:'Titulaires'},{id:'contributions',label:'Contributions'},{id:'discipline',label:'Discipline'}]
 const rankingValue=(row:(typeof stats)[number])=>ranking==='attendance'?row.attendanceRate:ranking==='starts'?row.started:ranking==='contributions'?row.contributions:ranking==='discipline'?row.cards:row[ranking]
 const rankingLabel=(row:(typeof stats)[number])=>ranking==='goals'?`${row.goals} but${row.goals!==1?'s':''}`:ranking==='assists'?`${row.assists} passe${row.assists!==1?'s':''}`:ranking==='attendance'?`${row.attendanceRate}% · ${row.attendance}/${row.attendanceAnswered}`:ranking==='starts'?`${row.started} titularisation${row.started!==1?'s':''}`:ranking==='contributions'?`${row.contributions} action${row.contributions!==1?'s':''} décisive${row.contributions!==1?'s':''}`:`${row.cards} carton${row.cards!==1?'s':''}`
 const minimumResponses=Math.min(2,filteredData.sessions.length)
 const ranked=stats.filter(row=>ranking==='attendance'?row.attendanceAnswered>=minimumResponses&&row.attendanceAnswered>0:rankingValue(row)>0).sort((a,b)=>rankingValue(b)-rankingValue(a)||fullName(a.player).localeCompare(fullName(b.player))).slice(0,5)
 return <><div className="page-heading"><div><p className="eyebrow">SAISON {data.team?.season || '—'}</p><h2>Statistiques</h2><p>Touchez un joueur pour voir son suivi détaillé.</p></div></div>{championships.length>1&&<label className="league-switch"><span>Championnat</span><select aria-label="Choisir le championnat pour les statistiques" value={championshipId} onChange={event=>{setChampionshipId(event.target.value);setRoundId('')}}>{championships.map(item=><option key={item.id} value={item.id}>{item.name} · {item.season}</option>)}</select></label>}{rounds.length>0&&<><div className="league-history"><button type="button" aria-label="Journée précédente" disabled={index===0} onClick={previous}>‹</button><div aria-live="polite"><small>STATISTIQUES</small><strong>{selectedRound?`Après ${selectedRound.name}`:'Toutes les données'}</strong></div><button type="button" aria-label="Journée suivante" disabled={index===rounds.length} onClick={next}>›</button></div>{selectedRound&&<p className="league-history-note">Matchs de ce championnat jusqu’à cette journée ; séances et autres matchs jusqu’au {formatDate(selectedRound.date)}. Les matchs reportés restent dans leur journée d’origine.</p>}</>}{rounds.length===0&&<p className="league-history-note">Créez un championnat et ses journées pour parcourir les statistiques journée par journée.</p>}<section className="stat-hero"><div><b>{filteredData.matches.filter(match=>match.completed).length}</b><span>matchs joués</span></div><div><b>{filteredData.sessions.length}</b><span>séances</span></div><div><b>{Math.round(filteredData.sessions.reduce((total,session)=>total+Object.values(session.attendance).filter(status=>status==='présent').length,0)/Math.max(1,filteredData.sessions.length*players.length)*100)}%</b><span>présence</span></div></section><section className="rankings"><div className="section-title"><h3>Classements</h3><span>Individuels</span></div><div className="ranking-tabs">{options.map(option=><button key={option.id} className={ranking===option.id?'selected':''} onClick={()=>setRanking(option.id)}>{option.label}</button>)}</div>{ranked.length>0?<ol className="ranking-list">{ranked.map(row=>{const value=rankingValue(row);const place=ranked.findIndex(item=>rankingValue(item)===value)+1;return <li key={row.player.id}><span className={`ranking-place place-${place}`}>{place}</span><button onClick={()=>onOpenPlayer(row.player,filteredData)}><span className="table-number">{row.player.number??'—'}</span><strong>{shortName(row.player)}</strong><small>{row.player.mainPosition}</small></button><b>{rankingLabel(row)}</b></li>})}</ol>:<p className="ranking-empty">Pas encore de données pour ce classement.</p>}</section><div className="table-wrap"><table><thead><tr><th>Joueur</th><th>Prés.</th><th>M.</th><th>Tit.</th><th>⚽</th><th>PD</th><th>▰</th></tr></thead><tbody>{stats.map(({player,attendance,selected,started,goals,assists,cards})=><tr key={player.id}><td><button className="player-stat-link" onClick={()=>onOpenPlayer(player,filteredData)} aria-label={`Voir les statistiques de ${fullName(player)}`}><span className="table-number">{player.number??'—'}</span>{shortName(player)}<span>›</span></button></td><td>{attendance}/{filteredData.sessions.length}</td><td>{selected}</td><td>{started}</td><td>{goals}</td><td>{assists}</td><td>{cards||'—'}</td></tr>)}</tbody></table></div></> }

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
function SessionSheet({template,onClose,onSave}:{template?:Session;onClose:()=>void;onSave:(s:Session)=>void}) {const [title,setTitle]=useState(template?.title||'Entraînement');const [date,setDate]=useState(localDay(new Date()));const [time,setTime]=useState(template?.time||'18:30');return <Sheet title={template?'Dupliquer la séance':'Nouvelle séance'} close={onClose}>{template&&<p className="training-note">Le thème, les séquences et les équipes seront copiés. Les présences et incidents repartent à zéro.</p>}<Field label="Intitulé"><input value={title} onChange={e=>setTitle(e.target.value)}/></Field><div className="form-grid"><Field label="Date"><input type="date" value={date} onChange={e=>setDate(e.target.value)}/></Field><Field label="Heure"><input type="time" value={time} onChange={e=>setTime(e.target.value)}/></Field></div><button className="save-button" disabled={!date||!title.trim()} onClick={()=>onSave(template?duplicateSession(template,uid(),date,time,title.trim()):{id:uid(),title:title.trim(),date,time,attendance:{}})}>{template?'Dupliquer la séance':'Créer la séance'}</button></Sheet> }
function TrainingIncident({session,player,update}:{session:Session;player:Player;update:(fn:(d:AppData)=>AppData)=>void}){const [open,setOpen]=useState(false),[note,setNote]=useState(session.incidents?.[player.id]||''),[markInjured,setMarkInjured]=useState(false);const saved=session.incidents?.[player.id];const save=()=>{update(data=>({...data,players:markInjured?data.players.map(item=>item.id===player.id?{...item,availability:'blessé'}:item):data.players,sessions:data.sessions.map(item=>{if(item.id!==session.id)return item;const incidents={...item.incidents};if(note.trim())incidents[player.id]=note.trim();else delete incidents[player.id];return {...item,incidents}})}));setOpen(false);setMarkInjured(false)};return <div className="training-incident"><button onClick={()=>{setNote(saved||'');setOpen(!open)}}>{saved?'Incident renseigné · modifier':'+ Incident'}</button>{open&&<div className="training-incident-form"><label className="field"><span>Note sur l’incident</span><textarea value={note} onChange={event=>setNote(event.target.value)} placeholder="Ex. Blessure pendant la séance"/></label><label className="training-checkbox"><input type="checkbox" checked={markInjured} onChange={event=>setMarkInjured(event.target.checked)}/> Marquer également ce joueur blessé dans l’effectif</label><button className="league-outline" onClick={save}>Enregistrer l’incident</button><p className="training-note">{session.attendance[player.id]==='présent'?'Le joueur reste comptabilisé présent pour cette séance.':'La présence de ce joueur est gérée séparément.'}</p></div>}</div>}

function MatchEditSheet({match,players,onClose,onSave}:{match:Match;players:Player[];onClose:()=>void;onSave:(match:Match)=>void}) {
 const [date,setDate]=useState(match.date),[time,setTime]=useState(match.time),[venue,setVenue]=useState(match.venue),[calledUp,setCalledUp]=useState(match.calledUp)
 const [matchType,setMatchType]=useState<MatchType|''>(match.championshipFixtureId?'championnat':match.matchType||'')
 const candidates=players.filter(player=>player.availability==='disponible'||calledUp.includes(player.id))
 const toggle=(playerId:string)=>setCalledUp(current=>current.includes(playerId)?current.filter(id=>id!==playerId):[...current,playerId])
 const save=()=>{if(!date)return;const removed=match.calledUp.some(playerId=>!calledUp.includes(playerId));if(removed&&match.completed&&!window.confirm('Ce match possède déjà un bilan. Les événements enregistrés seront conservés, mais les convocations et la composition seront modifiées. Continuer ?'))return;const lineup=Object.fromEntries(Object.entries(match.lineup).filter(([,playerId])=>calledUp.includes(playerId)));const {matchType:_previousType,...rest}=match;onSave({...rest,...(matchType?{matchType}:{}),date,time,venue,calledUp,lineup,substitutes:match.substitutes.filter(playerId=>calledUp.includes(playerId)),lineupValidated:removed?false:match.lineupValidated})}
 return <Sheet title="Informations du match" close={onClose}><p className="league-score-note">{match.championshipFixtureId?'L’adversaire et le domicile sont définis dans le championnat.':''} Complétez les informations disponibles ; les convocations peuvent être modifiées plus tard.</p><Field label="Type de match"><select value={matchType} disabled={Boolean(match.championshipFixtureId)} onChange={event=>setMatchType(event.target.value as MatchType|'')}><option value="">Non précisé</option><option value="championnat">Championnat</option><option value="coupe">Coupe</option><option value="amical">Amical</option></select></Field>{matchType==='championnat'&&!match.championshipFixtureId&&<p className="league-hint">Pour comptabiliser ce match dans le classement, rattachez-le à une journée depuis Championnat.</p>}<div className="form-grid"><Field label="Date"><input type="date" required value={date} onChange={event=>setDate(event.target.value)}/></Field><Field label="Heure (facultatif)"><input type="time" value={time} onChange={event=>setTime(event.target.value)}/></Field></div><Field label="Lieu (facultatif)"><input value={venue} onChange={event=>setVenue(event.target.value)}/></Field><div className="callup-head"><strong>Convoqués</strong><span>{calledUp.length} sélectionnés</span></div>{candidates.length===0&&<p className="league-hint">Aucun joueur disponible dans l’effectif.</p>}<div className="callup-list">{candidates.map(player=><button key={player.id} onClick={()=>toggle(player.id)} className={calledUp.includes(player.id)?'checked':''}><span>{calledUp.includes(player.id)?'✓':'+'}</span><b>{playerNumber(player)}</b>{fullName(player)}</button>)}</div><button disabled={!date} className="save-button" onClick={save}>Enregistrer les modifications</button></Sheet>
}
function MatchSheet({data,players,template,onClose,onSave}:{data:AppData;players:Player[];template?:Match;onClose:()=>void;onSave:(match:Match,link?:MatchChampionshipLink)=>string}) {
 const now=new Date()
 const [opponent,setOpponent]=useState('')
 const [date,setDate]=useState(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`)
 const [time,setTime]=useState(template?.time||'15:00')
 const [venue,setVenue]=useState(template?.venue||'Stade des Cèdres')
 const [home,setHome]=useState(template?.home??true)
 const [matchType,setMatchType]=useState<MatchType>(template?.matchType||'championnat')
 const [championshipId,setChampionshipId]=useState(()=>data.championships?.find(item=>item.season===data.team?.season)?.id||data.championships?.[0]?.id||'')
 const [roundId,setRoundId]=useState('')
 const [opponentId,setOpponentId]=useState('')
 const [calledUp,setCalledUp]=useState<string[]>([])
 const [error,setError]=useState('')
 const available=players.filter(player=>player.availability==='disponible')
 const championship=data.championships?.find(item=>item.id===championshipId)
 const round=championship?.rounds.find(item=>item.id===roundId)
 const own=championship?.teams.find(team=>team.own)
 const scheduled=round?.fixtures.find(fixture=>fixture.homeId===own?.id||fixture.awayId===own?.id)
 const opponentTeam=championship?.teams.find(team=>team.id===opponentId&&!team.own)
 const displayOpponent=matchType==='championnat'&&roundId?opponentTeam?.name||'':opponent.trim()
 const duplicate=data.matches.find(match=>match.date===date&&match.home===home&&match.opponent.trim().toLocaleLowerCase('fr-FR')===displayOpponent.toLocaleLowerCase('fr-FR'))
 const toggle=(playerId:string)=>setCalledUp(current=>current.includes(playerId)?current.filter(value=>value!==playerId):[...current,playerId])
 const changeRound=(value:string)=>{
   setRoundId(value);setOpponentId('');setError('')
   const next=championship?.rounds.find(item=>item.id===value)
   if(!next)return
   setDate(next.date)
   const fixture=next.fixtures.find(item=>item.homeId===own?.id||item.awayId===own?.id)
   if(fixture&&own){setHome(fixture.homeId===own.id);setOpponentId(fixture.homeId===own.id?fixture.awayId:fixture.homeId);if(fixture.date)setDate(fixture.date)}
 }
 const submit=()=>{
   if(!displayOpponent||!date||calledUp.length<11)return
   if(duplicate&&!window.confirm(`Un match contre ${duplicate.opponent} existe déjà à cette date. Pour réutiliser un match existant, rattachez-le depuis Championnat, dans Équipes et règles. Voulez-vous quand même créer un autre match ?`))return
   const link=matchType==='championnat'&&roundId&&championship&&opponentTeam
     ?{championshipId:championship.id,roundId,opponentId:opponentTeam.id,fixtureId:uid()}:undefined
   const newMatch:Match={id:uid(),opponent:displayOpponent,date,time,venue,home,calledUp,formation:'4-2-3-1',lineup:{},substitutes:[],events:[],matchType}
   setError(onSave(newMatch,link))
 }
 return <Sheet title={template?'Dupliquer un match':'Créer un match'} close={onClose}>
   {template&&<p className="match-template-note">Créé à partir de {template.opponent} : renseignez une nouvelle date et un nouvel adversaire.</p>}
   <span className="match-type-label">Type de match</span>
   <div className="match-type-options" role="group" aria-label="Type de match">{([['championnat','Championnat'],['coupe','Coupe'],['amical','Amical']] as const).map(([value,label])=><button type="button" key={value} className={matchType===value?'selected':''} aria-pressed={matchType===value} onClick={()=>{setMatchType(value);setError('')}}>{label}</button>)}</div>
   {matchType==='championnat'&&<div className="match-league-link">{data.championships?.length?<><Field label="Championnat à associer"><select value={championshipId} onChange={event=>{setChampionshipId(event.target.value);setRoundId('');setOpponentId('');setError('')}}><option value="">À rattacher plus tard</option>{data.championships.map(item=><option key={item.id} value={item.id}>{item.name} · {item.season}</option>)}</select></Field>{championship&&<Field label="Journée"><select value={roundId} onChange={event=>changeRound(event.target.value)}><option value="">À rattacher plus tard</option>{championship.rounds.map(item=><option key={item.id} value={item.id}>{item.name} · {formatDate(item.date)}</option>)}</select></Field>}{championship&&championship.rounds.length===0&&<p className="league-hint">Aucune journée créée : ce match pourra être rattaché plus tard depuis Championnat.</p>}{!roundId&&<p className="league-hint">Sans journée sélectionnée, ce match ne comptera pas encore dans le classement. Vous pourrez le rattacher plus tard.</p>}</>:<p className="league-hint">Aucun championnat créé pour cette équipe. Vous pourrez rattacher ce match après avoir créé le championnat et sa journée.</p>}</div>}
   {matchType==='championnat'&&roundId&&championship?<Field label="Adversaire"><select value={opponentId} onChange={event=>{setOpponentId(event.target.value);setError('')}} disabled={Boolean(scheduled)}><option value="">Choisir une équipe</option>{championship.teams.filter(team=>!team.own).map(team=><option key={team.id} value={team.id}>{team.name}</option>)}</select></Field>:<Field label="Adversaire"><input autoFocus placeholder="Ex. AS Montchat" value={opponent} onChange={event=>setOpponent(event.target.value)}/></Field>}
   {matchType==='championnat'&&roundId&&scheduled?.matchId&&<p className="league-error" role="alert">Un match est déjà lié à cette journée. Ouvrez-le depuis Championnat ou Matchs pour éviter un doublon.</p>}
   {matchType==='championnat'&&roundId&&scheduled&&!scheduled.matchId&&scheduled.homeScore!==undefined&&<p className="league-hint">Le score déjà saisi dans cette journée sera conservé et associé au match.</p>}
   {duplicate&&<p className="league-hint">Un match contre {duplicate.opponent} est déjà prévu à cette date. Vérifiez qu’il ne s’agit pas d’un doublon.</p>}
   <div className="form-grid"><Field label="Date"><input type="date" value={date} onChange={event=>setDate(event.target.value)}/></Field><Field label="Heure"><input type="time" value={time} onChange={event=>setTime(event.target.value)}/></Field></div>
   <Field label="Lieu"><input value={venue} onChange={event=>setVenue(event.target.value)}/></Field>
   <div className="toggle-choice"><button type="button" disabled={Boolean(matchType==='championnat'&&roundId&&scheduled)} className={home?'active':''} onClick={()=>setHome(true)}>Domicile</button><button type="button" disabled={Boolean(matchType==='championnat'&&roundId&&scheduled)} className={!home?'active':''} onClick={()=>setHome(false)}>Extérieur</button></div>
   <div className="callup-head"><strong>Convoqués</strong><span>{calledUp.length} sélectionnés</span></div><div className="callup-list">{available.map(player=><button type="button" key={player.id} onClick={()=>toggle(player.id)} className={calledUp.includes(player.id)?'checked':''}><span>{calledUp.includes(player.id)?'✓':'+'}</span><b>{playerNumber(player)}</b>{fullName(player)}</button>)}</div>
   {error&&<p className="league-error" role="alert">{error}</p>}
   <button disabled={!displayOpponent||!date||calledUp.length<11||Boolean(matchType==='championnat'&&roundId&&scheduled?.matchId)} className="save-button" onClick={submit}>{template?'Dupliquer et préparer la compo':'Créer et préparer la compo'}</button>
 </Sheet>
}
function ReportSheet({teamName,match,players,onClose,onSave}:{teamName:string;match:Match;players:Player[];onClose:()=>void;onSave:(m:Match)=>void}) {const [home,setHome]=useState(match.scoreHome?.toString()||'');const [away,setAway]=useState(match.scoreAway?.toString()||'');const [summary,setSummary]=useState(match.summary||'');const [events,setEvents]=useState<MatchEvent[]>(match.events);const add=(type:MatchEvent['type'])=>{const playerId=match.calledUp.find(id=>players.some(player=>player.id===id));if(playerId)setEvents(x=>[...x,{id:uid(),type,playerId,minute:undefined}])};return <Sheet title="Après-match" close={onClose}><div className="score-form"><div><label>{teamName}</label><input type="number" min="0" step="1" inputMode="numeric" value={home} onChange={e=>setHome(e.target.value)}/></div><b>—</b><div><label>{match.opponent}</label><input type="number" min="0" step="1" inputMode="numeric" value={away} onChange={e=>setAway(e.target.value)}/></div></div><div className="event-head"><h3>Événements</h3><div>{(['but','passe','jaune','rouge'] as MatchEvent['type'][]).map(t=><button key={t} disabled={!match.calledUp.some(id=>players.some(player=>player.id===id))} onClick={()=>add(t)}>+ {t}</button>)}</div></div>{!match.calledUp.some(id=>players.some(player=>player.id===id))&&<p className="league-score-note">Pour ajouter des événements joueurs, sélectionnez d’abord les convoqués dans les informations du match.</p>}{events.map((e,i)=><div className="event-row" key={e.id}><select value={e.type} onChange={ev=>setEvents(x=>x.map((a,j)=>j===i?{...a,type:ev.target.value as MatchEvent['type']}:a))}><option value="but">But</option><option value="passe">Passe</option><option value="jaune">Carton jaune</option><option value="rouge">Carton rouge</option><option value="entrée">Entrée</option><option value="sortie">Sortie</option></select><select value={e.playerId} onChange={ev=>setEvents(x=>x.map((a,j)=>j===i?{...a,playerId:ev.target.value}:a))}>{match.calledUp.map(id=>{const p=players.find(x=>x.id===id);return p&&<option key={id} value={id}>{playerNumber(p)} · {fullName(p)}</option>})}</select><input placeholder="min." type="number" value={e.minute||''} onChange={ev=>setEvents(x=>x.map((a,j)=>j===i?{...a,minute:Number(ev.target.value)}:a))}/><button onClick={()=>setEvents(x=>x.filter((_,j)=>j!==i))}>×</button></div>)}<Field label="Commentaire global"><textarea placeholder="Ce qui a fonctionné, axes de progrès..." value={summary} onChange={e=>setSummary(e.target.value)}/></Field><button className="save-button" disabled={home.trim()===''||away.trim()===''||!Number.isInteger(Number(home))||!Number.isInteger(Number(away))||Number(home)<0||Number(away)<0} onClick={()=>onSave({...match,scoreHome:Number(home),scoreAway:Number(away),summary,events,completed:true})}>Enregistrer le bilan</button></Sheet> }
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
