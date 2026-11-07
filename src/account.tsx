import { useState, type FormEvent } from 'react'
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword, verifyBeforeUpdateEmail, type User } from 'firebase/auth'
import type { CoachProfile, TeamProfile, TeamRecord } from './types'
import './account.css'

export const teamCategories = ['U6','U7','U8','U9','U10','U11','U12','U13','U14','U15','U16','U17','U18','U19','Seniors','Loisirs']
const startYear = new Date().getMonth() >= 6 ? new Date().getFullYear() : new Date().getFullYear() - 1
export const currentSeason = `${startYear}–${String(startYear+1).slice(-2)}`
export const seasons = Array.from({length:5},(_,index)=>{const year=startYear-2+index;return `${year}–${String(year+1).slice(-2)}`})

function Field({label,children}:{label:string;children:React.ReactNode}) {return <label className="field"><span>{label}</span>{children}</label>}

export function TeamForm({team,onSave,onCancel}:{team?:TeamProfile;onSave:(team:TeamProfile)=>Promise<void>;onCancel?:()=>void}) {
  const [name,setName]=useState(team?.name||'')
  const [club,setClub]=useState(team?.club||'')
  const [category,setCategory]=useState(team?.category||'U18')
  const [season,setSeason]=useState(team?.season||currentSeason)
  const [pending,setPending]=useState(false)
  const [error,setError]=useState('')
  const submit=async(event:FormEvent)=>{event.preventDefault();if(!name.trim())return;setPending(true);setError('');try{await onSave({name:name.trim(),club:club.trim(),category,season,onboardingCompleted:true})}catch(error){setError(error instanceof Error?error.message:'Enregistrement impossible. Réessayez.')}finally{setPending(false)}}
  return <form onSubmit={submit}><Field label="Nom de l’équipe"><input autoFocus required value={name} placeholder="Ex. Olympique Lyonnais U18" onChange={event=>setName(event.target.value)}/></Field><Field label="Club (facultatif)"><input value={club} onChange={event=>setClub(event.target.value)} placeholder="Nom du club"/></Field><div className="form-grid"><Field label="Catégorie"><select value={category} onChange={event=>setCategory(event.target.value)}>{!teamCategories.includes(category)&&<option>{category}</option>}{teamCategories.map(item=><option key={item}>{item}</option>)}</select></Field><Field label="Saison"><select value={season} onChange={event=>setSeason(event.target.value)}>{!seasons.includes(season)&&<option>{season}</option>}{seasons.map(item=><option key={item}>{item}</option>)}</select></Field></div>{error&&<p className="account-error" role="alert">{error}</p>}<button className="save-button" disabled={pending||!name.trim()}>{pending?'Enregistrement…':team?'Enregistrer les modifications':'Créer mon équipe'}</button>{onCancel&&<button type="button" className="account-back-link" onClick={onCancel}>Annuler</button>}</form>
}

export function ProfileForm({profile,onSave}:{profile?:CoachProfile;onSave:(profile:CoachProfile)=>Promise<void>}) {
  const [firstName,setFirstName]=useState(profile?.firstName||'')
  const [lastName,setLastName]=useState(profile?.lastName||'')
  const [pending,setPending]=useState(false)
  const [message,setMessage]=useState('')
  const [error,setError]=useState('')
  const submit=async(event:FormEvent)=>{event.preventDefault();if(!firstName.trim()||!lastName.trim())return;setPending(true);setMessage('');setError('');try{await onSave({firstName:firstName.trim(),lastName:lastName.trim()});setMessage('Profil enregistré.')}catch{setError('Impossible d’enregistrer votre profil. Vérifiez votre connexion et réessayez.')}finally{setPending(false)}}
  return <form onSubmit={submit}><div className="form-grid"><Field label="Prénom"><input required autoComplete="given-name" value={firstName} onChange={event=>setFirstName(event.target.value)}/></Field><Field label="Nom"><input required autoComplete="family-name" value={lastName} onChange={event=>setLastName(event.target.value)}/></Field></div>{error&&<p className="account-error" role="alert">{error}</p>}{message&&<p className="account-success" role="status">{message}</p>}<button className="save-button" disabled={pending||!firstName.trim()||!lastName.trim()}>{pending?'Enregistrement…':'Enregistrer mon profil'}</button></form>
}

function SecurityForm({user}:{user:User}) {
  const [action,setAction]=useState<'password'|'email'>('password')
  const [currentPassword,setCurrentPassword]=useState('')
  const [newPassword,setNewPassword]=useState('')
  const [confirmation,setConfirmation]=useState('')
  const [email,setEmail]=useState('')
  const [pending,setPending]=useState(false)
  const [error,setError]=useState('')
  const [message,setMessage]=useState('')
  const submit=async(event:FormEvent)=>{event.preventDefault();setError('');setMessage('');if(!user.email)return setError('Adresse e-mail du compte indisponible.');if(action==='password'&&newPassword!==confirmation)return setError('Les nouveaux mots de passe ne correspondent pas.');setPending(true);try{await reauthenticateWithCredential(user,EmailAuthProvider.credential(user.email,currentPassword));if(action==='password'){await updatePassword(user,newPassword);setMessage('Mot de passe modifié.')}else{await verifyBeforeUpdateEmail(user,email.trim());setMessage('Un lien de confirmation a été envoyé à la nouvelle adresse. Confirmez-le pour terminer le changement.')}setCurrentPassword('');setNewPassword('');setConfirmation('')}catch(reason){const code=typeof reason==='object'&&reason&&'code'in reason?String(reason.code):'';setError(code.includes('invalid-credential')||code.includes('wrong-password')?'Mot de passe actuel incorrect.':code.includes('email-already-in-use')?'Cette adresse e-mail est déjà utilisée.':code.includes('weak-password')?'Choisissez un mot de passe plus robuste.':'Modification impossible. Vérifiez votre connexion et réessayez.')}finally{setPending(false)}}
  return <><div className="account-tabs"><button type="button" className={action==='password'?'selected':''} onClick={()=>{setAction('password');setError('');setMessage('')}}>Mot de passe</button><button type="button" className={action==='email'?'selected':''} onClick={()=>{setAction('email');setError('');setMessage('')}}>Adresse e-mail</button></div><form onSubmit={submit}><Field label="Mot de passe actuel"><input required type="password" autoComplete="current-password" value={currentPassword} onChange={event=>setCurrentPassword(event.target.value)}/></Field>{action==='password'?<><Field label="Nouveau mot de passe"><input required type="password" minLength={6} autoComplete="new-password" value={newPassword} onChange={event=>setNewPassword(event.target.value)}/></Field><Field label="Confirmer le nouveau mot de passe"><input required type="password" autoComplete="new-password" value={confirmation} onChange={event=>setConfirmation(event.target.value)}/></Field></>:<Field label="Nouvelle adresse e-mail"><input required type="email" autoComplete="email" value={email} onChange={event=>setEmail(event.target.value)}/></Field>}{error&&<p className="account-error" role="alert">{error}</p>}{message&&<p className="account-success" role="status">{message}</p>}<button className="save-button" disabled={pending}>{pending?'Un instant…':action==='password'?'Modifier le mot de passe':'Envoyer le lien de confirmation'}</button></form></>
}

export function AccountPage({user,profile,teams,activeTeamId,onSaveProfile,onSaveTeam,onCreateTeam,onSwitch,onBack,onSignOut}:{user:User|null;profile:CoachProfile;teams:TeamRecord[];activeTeamId:string;onSaveProfile:(profile:CoachProfile)=>Promise<void>;onSaveTeam:(id:string,team:TeamProfile)=>Promise<void>;onCreateTeam:(team:TeamProfile)=>Promise<void>;onSwitch:(id:string)=>void;onBack:()=>void;onSignOut:()=>void}) {
  const [section,setSection]=useState<'menu'|'profile'|'security'|'teams'|'create'|'edit'>('menu')
  const [editingId,setEditingId]=useState(activeTeamId)
  const editingTeam=teams.find(team=>team.id===editingId)?.data.team
  const title=section==='profile'?'Mes informations':section==='security'?'Sécurité du compte':section==='teams'?'Mes équipes':section==='create'?'Nouvelle équipe':section==='edit'?'Modifier l’équipe':'Mon profil'
  const back=()=>{if(section==='menu')onBack();else if(section==='edit'||section==='create')setSection('teams');else setSection('menu')}
  return <><div className="page-heading"><div className="account-heading"><button className="back account-back" aria-label="Retour" onClick={back}>‹</button><div><p className="eyebrow">ESPACE COACH</p><h2>{title}</h2></div></div></div>{section==='menu'&&<><div className="account-identity"><div className="account-avatar">{profile.firstName[0]?.toUpperCase()}{profile.lastName[0]?.toUpperCase()}</div><div><h3>{profile.firstName} {profile.lastName}</h3><p>{user?.email||'Mode démo local'}</p></div></div><div className="account-menu"><button onClick={()=>setSection('profile')}><span>◉</span><div><strong>Mes informations</strong><small>Modifier mon nom et mon prénom</small></div><b>›</b></button>{user&&<button onClick={()=>setSection('security')}><span>◇</span><div><strong>Compte et sécurité</strong><small>Adresse e-mail et mot de passe</small></div><b>›</b></button>}<button onClick={()=>setSection('teams')}><span>⚑</span><div><strong>Mes équipes</strong><small>{teams.length} équipe{teams.length!==1?'s':''}</small></div><b>›</b></button></div>{user&&<button className="account-signout" onClick={onSignOut}>Se déconnecter</button>}</>}{section==='profile'&&<section className="account-panel"><ProfileForm profile={profile} onSave={onSaveProfile}/></section>}{section==='security'&&user&&<section className="account-panel"><p className="account-hint">Compte actuel : {user.email}</p><SecurityForm user={user}/></section>}{section==='teams'&&<><div className="account-team-list">{teams.map(team=><article key={team.id}><div><strong>{team.data.team?.name||'Équipe à configurer'}</strong><small>{team.data.team?.category} · Saison {team.data.team?.season}{team.id===activeTeamId?' · Équipe active':''}</small></div><button onClick={()=>{setEditingId(team.id);setSection('edit')}}>Gérer</button>{team.id!==activeTeamId&&<button onClick={()=>onSwitch(team.id)}>Choisir</button>}</article>)}</div><button className="save-button" onClick={()=>setSection('create')}>＋ Ajouter une équipe</button></>}{section==='create'&&<section className="account-panel"><TeamForm onSave={onCreateTeam} onCancel={()=>setSection('teams')}/></section>}{section==='edit'&&editingTeam&&<section className="account-panel"><TeamForm team={editingTeam} onSave={async team=>{await onSaveTeam(editingId,team);setSection('teams')}} onCancel={()=>setSection('teams')}/></section>}</>
}
