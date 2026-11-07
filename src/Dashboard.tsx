import { useEffect, useRef, useState } from 'react'
import { calculateStandings } from './championship'
import type { AppData, Match, Player, Session } from './types'
import './dashboard.css'

type View='effectif'|'présences'|'matchs'|'tactique'|'championnat'|'stats'
type Card={id:string;eyebrow:string;title:string;detail:string;action:string;open:()=>void}
type Task={id:string;date:string;title:string;detail:string;open:()=>void}
const day=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
const dateLabel=(date:string)=>new Date(`${date}T12:00`).toLocaleDateString('fr-FR',{weekday:'short',day:'numeric',month:'short'}).replace('.','')
const dateTime=(item:{date:string;time:string})=>`${item.date}T${item.time||'23:59'}`
const shortName=(player:Player)=>`${player.firstName} ${player.lastName[0]||''}.`
const fullName=(player:Player)=>`${player.firstName} ${player.lastName}`

export function Dashboard({data,firstName,go,newSession,openSession,openMatch,openReport,openPlayer}:{data:AppData;firstName:string;go:(view:View)=>void;newSession:()=>void;openSession:(session:Session)=>void;openMatch:(match:Match)=>void;openReport:(match:Match)=>void;openPlayer:(player:Player)=>void}) {
 const today=day(new Date())
 const players=data.players.filter(player=>player.active)
 const unavailable=players.filter(player=>player.availability!=='disponible')
 const upcomingSessions=data.sessions.filter(session=>session.date>=today).sort((a,b)=>dateTime(a).localeCompare(dateTime(b)))
 const upcomingMatches=data.matches.filter(match=>!match.completed&&match.date>=today).sort((a,b)=>dateTime(a).localeCompare(dateTime(b)))
 const nextSession=upcomingSessions[0],nextMatch=upcomingMatches[0]
 const responses=nextSession?players.filter(player=>Boolean(nextSession.attendance[player.id])).length:0
 const present=nextSession?players.filter(player=>nextSession.attendance[player.id]==='présent').length:0
 const pastSessions=data.sessions.filter(session=>session.date<today).sort((a,b)=>dateTime(b).localeCompare(dateTime(a)))
 const completedMatches=data.matches.filter(match=>match.completed&&match.scoreHome!==undefined&&match.scoreAway!==undefined).sort((a,b)=>dateTime(b).localeCompare(dateTime(a)))
 const overdue:Task[]=[]
 for(const session of pastSessions){const answered=players.filter(player=>Boolean(session.attendance[player.id])).length;if(players.length&&answered<players.length)overdue.push({id:`session-${session.id}`,date:session.date,title:'Présences à compléter',detail:`${session.title} · ${dateLabel(session.date)} · ${answered}/${players.length} renseignés`,open:()=>openSession(session)})}
 for(const match of data.matches.filter(match=>match.date<today&&!match.completed))overdue.push({id:`match-${match.id}`,date:match.date,title:'Bilan de match à renseigner',detail:`vs ${match.opponent} · ${dateLabel(match.date)}`,open:()=>openReport(match)})
 overdue.sort((a,b)=>a.date.localeCompare(b.date))
 const end=new Date();end.setDate(end.getDate()+7);const through=day(end)
 const upcoming:Task[]=upcomingMatches.filter(match=>match.date<=through&&!match.lineupValidated).map(match=>({id:`prepare-${match.id}`,date:match.date,title:'Composition à préparer',detail:`vs ${match.opponent} · ${dateLabel(match.date)}`,open:()=>openMatch(match)}))
 const cards:Card[]=[]
 const ranked=(type:'but'|'passe'|'rouge')=>{
  const counts=players.map(player=>({player,count:data.matches.flatMap(match=>match.events).filter(event=>event.type===type&&event.playerId===player.id).length}))
  const max=Math.max(0,...counts.map(item=>item.count));return {max,leaders:counts.filter(item=>item.count===max&&max>0).map(item=>item.player)}
 }
 const makeLeader=(type:'but'|'passe',title:string,singular:string)=>{const {max,leaders}=ranked(type);if(max)cards.push({id:type,eyebrow:title,title:leaders.map(shortName).join(' · '),detail:`${max} ${singular}${max>1?'s':''}${leaders.length>1?' chacun · ex æquo':''}`,action:leaders.length===1?'Voir le joueur':'Voir les statistiques',open:()=>leaders.length===1?openPlayer(leaders[0]):go('stats')})}
 makeLeader('but','MEILLEUR BUTEUR','but');makeLeader('passe','MEILLEUR PASSEUR','passe décisive')
 const championship=data.championships?.[0]
 if(championship&&championship.rounds.some(round=>round.fixtures.some(fixture=>fixture.homeScore!==undefined&&fixture.awayScore!==undefined))){const standings=calculateStandings(championship),standing=standings.find(row=>row.team.own);if(standing)cards.push({id:'standing',eyebrow:'CLASSEMENT',title:`${standing.rank}${standing.rank===1?'er':'e'} sur ${championship.teams.length}${standings.filter(row=>row.rank===standing.rank).length>1?' · ex æquo':''}`,detail:`${championship.name} · ${standing.points} pts · ${standing.played} match${standing.played!==1?'s':''} joué${standing.played!==1?'s':''}`,action:'Voir le championnat',open:()=>go('championnat')})}
 const lastSessions=data.sessions.filter(session=>session.date<=today).sort((a,b)=>dateTime(b).localeCompare(dateTime(a))).slice(0,6)
 const answers=lastSessions.flatMap(session=>players.map(player=>session.attendance[player.id])).filter(Boolean)
 if(answers.length){const count=answers.filter(status=>status==='présent').length;cards.push({id:'attendance',eyebrow:'PRÉSENCE AUX ENTRAÎNEMENTS',title:`${Math.round(count/answers.length*100)} % de présence`,detail:`${count}/${answers.length} réponses · ${lastSessions.length} dernière${lastSessions.length>1?'s':''} séance${lastSessions.length>1?'s':''}`,action:'Voir les présences',open:()=>go('présences')})}
 const lastMatch=completedMatches[0]
 if(lastMatch){const own=lastMatch.scoreHome!,opponent=lastMatch.scoreAway!,result=own>opponent?'Victoire':own<opponent?'Défaite':'Match nul';cards.push({id:'result',eyebrow:'DERNIER RÉSULTAT',title:`${result} ${own}–${opponent}`,detail:`vs ${lastMatch.opponent} · ${dateLabel(lastMatch.date)}`,action:'Voir le bilan',open:()=>openReport(lastMatch)})}
 const reds=ranked('rouge');if(reds.max){const total=data.matches.flatMap(match=>match.events).filter(event=>event.type==='rouge').length;cards.push({id:'discipline',eyebrow:'DISCIPLINE',title:`${total} carton${total>1?'s':''} rouge${total>1?'s':''}`,detail:`${reds.leaders.map(shortName).join(' · ')} : ${reds.max}${reds.leaders.length>1?' chacun · ex æquo':''}`,action:'Voir les statistiques',open:()=>go('stats')})}
 if(data.players.length===0)return <><section className="welcome"><div><p className="eyebrow">BONJOUR, {firstName.toLocaleUpperCase('fr-FR')}</p><h2>Commençons par le groupe.</h2><p>Ajoutez vos joueurs pour préparer les séances, convocations et compositions.</p></div><div className="ball">⚽</div></section><section className="first-steps"><p className="eyebrow">PREMIÈRE ÉTAPE</p><h3>Ajoutez votre premier joueur</h3><p>Renseignez son nom et son poste. Le numéro est facultatif.</p><button className="primary" onClick={()=>go('effectif')}>Ajouter un joueur</button></section></>
 const heading=nextSession?.date===today?'Séance aujourd’hui':nextMatch&&nextMatch.date<=through?`Match à venir contre ${nextMatch.opponent}`:'Prêt pour la suite ?'
 const description=nextSession?.date===today?`${nextSession.title}${nextSession.time?` · ${nextSession.time}`:''}`:nextMatch&&nextMatch.date<=through?`${dateLabel(nextMatch.date)}${nextMatch.time?` · ${nextMatch.time}`:''}`:'Gardez le groupe concentré, une décision à la fois.'
 return <><section className="welcome"><div><p className="eyebrow">BONJOUR, {firstName.toLocaleUpperCase('fr-FR')}</p><h2>{heading}</h2><p>{description}</p></div><div className="ball">⚽</div></section>
 {cards.length>0&&<TeamCarousel cards={cards}/>}
 <div className="section-title"><h3>À venir</h3><button onClick={()=>go('matchs')}>Voir les matchs</button></div><div className="schedule-grid">
 <article className="next-card session"><span className="card-icon">↗</span><p>PROCHAINE SÉANCE</p><h3>{nextSession?.title||'Aucune séance prévue'}</h3><strong>{nextSession?`${dateLabel(nextSession.date)}${nextSession.time?` · ${nextSession.time}`:''}`:'Planifiez votre prochaine séance'}</strong><div className="card-footer"><span>{nextSession?`${responses}/${players.length} réponses`:''}</span><button onClick={()=>nextSession?openSession(nextSession):newSession()}>{nextSession?'Présences':'Créer une séance'} →</button></div></article>
 <article className="next-card match"><span className="card-icon">◉</span><p>PROCHAIN MATCH</p><h3>{nextMatch?`${nextMatch.home?'vs':'@'} ${nextMatch.opponent}`:'À planifier'}</h3><strong>{nextMatch?`${dateLabel(nextMatch.date)} · ${nextMatch.time||'Heure à définir'}`:'Ajoutez une rencontre'}</strong><div className="card-footer"><span>{nextMatch?.venue||'Lieu à définir'}</span><button onClick={()=>nextMatch?openMatch(nextMatch):go('matchs')}>{nextMatch?'Préparer':'Voir les matchs'} →</button></div></article></div>
 {(overdue.length>0||upcoming.length>0)&&<section className="dashboard-tasks"><div className="section-title"><h3>À faire et à compléter</h3><span className="task-count">{overdue.length+upcoming.length}</span></div>{overdue.length>0&&<TaskGroup title="À COMPLÉTER" tasks={overdue}/ >}{upcoming.length>0&&<TaskGroup title="À PRÉPARER · 7 PROCHAINS JOURS" tasks={upcoming}/>}</section>}
 <div className="section-title"><h3>Groupe du jour</h3><button onClick={()=>go('effectif')}>Effectif</button></div><div className="metric-row"><Metric value={players.length} label="joueurs actifs" tone="dark"/><Metric value={unavailable.length} label="indisponibles" tone={unavailable.length?'orange':'green'}/><Metric value={nextSession?`${present}/${players.length}`:'—'} label="présents prochaine séance" tone="lime"/></div>
 {unavailable.length>0&&<section className="availability"><div className="section-title"><h3>À surveiller</h3><span className="count">{unavailable.length}</span></div>{unavailable.map(player=><div className="person-row" key={player.id}><span className="mini-avatar">{player.firstName[0]}{player.lastName[0]}</span><div><strong>{fullName(player)}</strong><small>{player.mainPosition} · {player.number?`N°${player.number}`:'Sans n°'}</small></div><span className={`status ${player.availability}`}>{player.availability}</span></div>)}</section>}
 </>
}
function TaskGroup({title,tasks}:{title:string;tasks:Task[]}){const [showAll,setShowAll]=useState(false);return <div className="task-group"><p>{title}</p>{(showAll?tasks:tasks.slice(0,3)).map(task=><button key={task.id} className="task-row" onClick={task.open}><span className="task-icon">!</span><span><strong>{task.title}</strong><small>{task.detail}</small></span><b aria-hidden="true">›</b></button>)}{tasks.length>3&&<button className="task-more" onClick={()=>setShowAll(!showAll)}>{showAll?'Afficher moins':`Voir les ${tasks.length} actions`}</button>}</div>}
function Metric({value,label,tone}:{value:string|number;label:string;tone:string}){return <div className={`metric ${tone}`}><strong>{value}</strong><span>{label}</span></div>}
function TeamCarousel({cards}:{cards:Card[]}){
 const [index,setIndex]=useState(0),[paused,setPaused]=useState(false),[interacting,setInteracting]=useState(false)
 const [reduced]=useState(()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches)
 const touch=useRef<{x:number;y:number}|null>(null)
 const current=index%cards.length
 useEffect(()=>{if(cards.length<2||paused||interacting||reduced)return;const timer=window.setInterval(()=>{if(!document.hidden)setIndex(value=>(value+1)%cards.length)},15000);return()=>window.clearInterval(timer)},[cards.length,paused,interacting,reduced])
 const move=(offset:number)=>setIndex(value=>(value+offset+cards.length)%cards.length)
 return <section className="dashboard-carousel" aria-label="Le point sur l’équipe" onMouseEnter={()=>setInteracting(true)} onMouseLeave={()=>setInteracting(false)} onFocus={()=>setInteracting(true)} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))setInteracting(false)}}><div className="section-title"><h3>Le point sur l’équipe</h3>{cards.length>1&&!reduced&&<button onClick={()=>setPaused(!paused)}>{paused?'Reprendre':'Pause'} <span className="sr-only">le défilement automatique</span></button>}</div><div className="carousel-card" onTouchStart={event=>{const point=event.touches[0];touch.current={x:point.clientX,y:point.clientY};setInteracting(true)}} onTouchEnd={event=>{const point=event.changedTouches[0],start=touch.current;if(start&&Math.abs(point.clientX-start.x)>45&&Math.abs(point.clientX-start.x)>Math.abs(point.clientY-start.y))move(point.clientX<start.x?1:-1);touch.current=null;setInteracting(false)}}><p>{cards[current].eyebrow}</p><h3>{cards[current].title}</h3><span>{cards[current].detail}</span><button onClick={cards[current].open}>{cards[current].action} →</button></div>{cards.length>1&&<div className="carousel-controls"><button aria-label="Carte précédente" onClick={()=>move(-1)}>‹</button><div className="carousel-dots">{cards.map((card,i)=><button key={card.id} className={i===current?'active':''} aria-label={`Afficher ${card.eyebrow.toLocaleLowerCase('fr-FR')}`} aria-current={i===current?'true':undefined} onClick={()=>setIndex(i)}/>)}</div><button aria-label="Carte suivante" onClick={()=>move(1)}>›</button></div>}</section>
}
