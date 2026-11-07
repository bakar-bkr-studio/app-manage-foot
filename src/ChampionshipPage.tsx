import { useEffect, useState, type FormEvent } from 'react'
import type { AppData, Championship, ChampionshipFixture, ChampionshipRound, ChampionshipTieBreak, Match } from './types'
import { applyFixtureResult, standingsThroughRound, fixtureScoreFromMatch, orderedRounds, roundNumber } from './championship'
import { currentSeason, seasons } from './account'
import { ImportMatches } from './ImportMatches'
import './championship.css'

type Update = (fn:(current:AppData)=>AppData)=>void
const id=()=>crypto.randomUUID()
const monthLabel=(date:string)=>new Date(`${date}T12:00`).toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'})
const initialDate=()=>{const now=new Date();return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`}
const normalize=(value:string)=>value.trim().toLocaleLowerCase('fr-FR')
const seasonLabel=(season:string)=>season.replace(/^(\d{4})[–-](\d{2})$/,(_,start)=>`${start}–${Number(start)+1}`)
function SeasonSelect({value,onChange}:{value:string;onChange:(value:string)=>void}) {
  return <select required value={value} onChange={event=>onChange(event.target.value)}>{value&&!seasons.includes(value)&&<option value={value}>{seasonLabel(value)}</option>}{seasons.map(item=><option key={item} value={item}>{seasonLabel(item)}</option>)}</select>
}
function roundOptions(championship:Championship,currentId?:string):number[] {
  const highest=Math.max(0,...championship.rounds.map(round=>roundNumber(round.name)||0))
  const max=Math.max(22,championship.teams.length%2?championship.teams.length*2:(championship.teams.length-1)*2,highest)
  const used=new Set(championship.rounds.filter(round=>round.id!==currentId).map(round=>roundNumber(round.name)))
  return Array.from({length:max},(_,index)=>index+1).filter(number=>!used.has(number))
}

export function ChampionshipPage({data,update,onOpenMatch}:{data:AppData;update:Update;onOpenMatch:(id:string)=>void}) {
  const [selectedId,setSelectedId]=useState(data.championships?.[0]?.id||'')
  const [tab,setTab]=useState<'standings'|'rounds'|'teams'>('standings')
  const [creating,setCreating]=useState(!data.championships?.length)
  const [name,setName]=useState('')
  const [season,setSeason]=useState(data.team?.season||currentSeason)
  const [history,setHistory]=useState<{championshipId:string;roundId:string}|null>(null)
  const [points,setPoints]=useState({win:3,draw:1,loss:0})
  const [error,setError]=useState('')
  const championships=data.championships||[]
  const championship=championships.find(item=>item.id===selectedId)||championships[0]
  const ownTeam=championship?.teams.find(team=>team.own)
  const modify=(fn:(championship:Championship)=>Championship)=>{if(!championship)return;update(current=>({...current,championships:(current.championships||[]).map(item=>item.id===championship.id?fn(item):item)}))}
  const create=(event:FormEvent)=>{
    event.preventDefault();setError('')
    if(!name.trim()||!season.trim())return setError('Renseignez le nom et la saison.')
    if(Object.values(points).some(value=>!Number.isInteger(value)||value<0))return setError('Les points doivent être des nombres entiers positifs ou nuls.')
    const next:Championship={id:id(),name:name.trim(),season:season.trim(),winPoints:points.win,drawPoints:points.draw,lossPoints:points.loss,tieBreak:'goalDifference',teams:[{id:id(),name:data.team?.name||'Mon équipe',own:true}],rounds:[]}
    update(current=>({...current,championships:[...(current.championships||[]),next]}));setSelectedId(next.id);setCreating(false);setTab('teams');setName('')
  }
  if(creating||!championship)return <><div className="page-heading"><div><p className="eyebrow">COMPÉTITION</p><h2>Championnat</h2><p>Suivez votre championnat et ses résultats.</p></div></div><section className="league-panel"><h3>Créer un championnat</h3><p className="league-hint">Ajoutez d’abord les équipes, puis les rencontres de chaque journée.</p><form onSubmit={create}><label className="field"><span>Nom du championnat</span><input required value={name} onChange={event=>setName(event.target.value)} placeholder="Ex. Départemental U18 – Groupe B"/></label><label className="field"><span>Saison</span><SeasonSelect value={season} onChange={setSeason}/></label><p className="league-label">Barème des points</p><div className="league-points">{([['win','Victoire'],['draw','Nul'],['loss','Défaite']] as const).map(([key,label])=><label className="field" key={key}><span>{label}</span><input type="number" min="0" step="1" required value={Number.isNaN(points[key])?'':points[key]} onChange={event=>setPoints(current=>({...current,[key]:event.target.value===''?NaN:Number(event.target.value)}))}/></label>)}</div>{error&&<p className="league-error" role="alert">{error}</p>}<button className="save-button">Créer le championnat</button>{championship&&<button type="button" className="league-text-button" onClick={()=>setCreating(false)}>Annuler</button>}</form></section></>

  const chronologicalRounds=orderedRounds(championship.rounds)
  const selectedRoundId=history?.championshipId===championship.id?history.roundId:''
  const selectedIndex=chronologicalRounds.findIndex(round=>round.id===selectedRoundId)
  const latestPlayedIndex=chronologicalRounds.reduce((last,round,index)=>round.fixtures.some(fixture=>fixture.homeScore!==undefined&&fixture.awayScore!==undefined)?index:last,-1)
  const historyIndex=selectedIndex<0?(latestPlayedIndex<0?0:latestPlayedIndex):selectedIndex
  const selectedRound=chronologicalRounds[historyIndex]
  const standings=standingsThroughRound(championship,selectedRound?.id)
  const navigate=(index:number)=>{const target=chronologicalRounds[index];if(target)setHistory({championshipId:championship.id,roundId:target.id})}
  return <><div className="page-heading"><div><p className="eyebrow">COMPÉTITION · {championship.season}</p><h2>Championnat</h2><p>{championship.name}</p></div><button className="primary" onClick={()=>{setCreating(true);setSeason(data.team?.season||currentSeason);setError('')}}>＋ Créer</button></div>{championships.length>1&&<label className="league-switch"><span>Championnat</span><select aria-label="Choisir un championnat" value={championship.id} onChange={event=>setSelectedId(event.target.value)}>{championships.map(item=><option key={item.id} value={item.id}>{item.name} · {item.season}</option>)}</select></label>}<div className="league-tabs" aria-label="Navigation du championnat">{([['standings','Classement'],['rounds','Journées'],['teams','Équipes & règles']] as const).map(([key,label])=><button key={key} className={tab===key?'selected':''} aria-pressed={tab===key} onClick={()=>setTab(key)}>{label}</button>)}</div>{tab==='standings'&&<><div className="league-section-heading"><div><h3>Classement</h3><p>Mis à jour avec les scores renseignés</p></div><span>{championship.teams.length} équipes</span></div>{selectedRound&&<div className="league-history"><button type="button" aria-label="Journée précédente" disabled={historyIndex===0} onClick={()=>navigate(historyIndex-1)}>‹</button><div aria-live="polite"><small>CLASSEMENT APRÈS</small><strong>{selectedRound.name}</strong></div><button type="button" aria-label="Journée suivante" disabled={historyIndex===chronologicalRounds.length-1} onClick={()=>navigate(historyIndex+1)}>›</button></div>}{selectedRound&&<p className="league-history-note">Résultats enregistrés jusqu’à cette journée, y compris les matchs reportés rattachés à celle-ci. Les journées sans numéro sont placées après les journées numérotées.</p>}<p className="league-scroll-hint">Faites glisser le tableau pour voir toutes les colonnes →</p><div className="league-table-wrap"><table className="league-table"><thead><tr><th>Pos.</th><th>Équipe</th><th>Pts</th><th>J</th><th>G</th><th>N</th><th>P</th><th>BP</th><th>BC</th><th>Diff.</th></tr></thead><tbody>{standings.map(row=><tr className={row.team.own?'own-team':''} key={row.team.id}><td>{row.rank}</td><td>{row.team.name}{row.team.own&&<small>Votre équipe</small>}</td><td><strong>{row.points}</strong></td><td>{row.played}</td><td>{row.won}</td><td>{row.drawn}</td><td>{row.lost}</td><td>{row.goalsFor}</td><td>{row.goalsAgainst}</td><td>{row.goalsFor-row.goalsAgainst>0?'+':''}{row.goalsFor-row.goalsAgainst}</td></tr>)}</tbody></table></div><p className="league-caption">J : joués · G : gagnés · N : nuls · P : perdus · BP/BC : buts pour/contre.<br/>Départage : {championship.tieBreak==='pointsOnly'?'points uniquement':championship.tieBreak==='goalsScored'?'points, buts marqués, puis différence de buts':'points, différence de buts, puis buts marqués'}. En cas d’égalité sur ces critères, les équipes gardent la même place. Le classement officiel peut appliquer d’autres règles.</p>{championship.rounds.length===0&&<div className="league-empty">Ajoutez les équipes, puis créez une journée pour commencer.</div>}</>}{tab==='teams'&&<ChampionshipTeams data={data} championship={championship} modify={modify} update={update}/ >}{tab==='rounds'&&<ChampionshipRounds data={data} championship={championship} ownId={ownTeam?.id||''} update={update} modify={modify} onOpenMatch={onOpenMatch}/>}</>
}

function ChampionshipTeams({data,championship,modify,update}:{data:AppData;championship:Championship;modify:(fn:(championship:Championship)=>Championship)=>void;update:Update}) {
  const [name,setName]=useState('')
  const [editing,setEditing]=useState('')
  const [editName,setEditName]=useState('')
  const [competitionName,setCompetitionName]=useState(championship.name)
  const [competitionSeason,setCompetitionSeason]=useState(championship.season)
  const [points,setPoints]=useState({win:championship.winPoints,draw:championship.drawPoints,loss:championship.lossPoints})
  const [tieBreak,setTieBreak]=useState<ChampionshipTieBreak>(championship.tieBreak||'goalDifference')
  const [error,setError]=useState('')
  const [message,setMessage]=useState('')
  useEffect(()=>{setPoints({win:championship.winPoints,draw:championship.drawPoints,loss:championship.lossPoints});setTieBreak(championship.tieBreak||'goalDifference')},[championship.id,championship.winPoints,championship.drawPoints,championship.lossPoints,championship.tieBreak])
  useEffect(()=>{setCompetitionName(championship.name);setCompetitionSeason(championship.season);setEditing('');setError('');setMessage('')},[championship.id])
  const add=(event:FormEvent)=>{event.preventDefault();const next=name.trim();if(!next)return;if(championship.teams.some(team=>normalize(team.name)===normalize(next))){setError('Cette équipe figure déjà dans le championnat.');return}modify(current=>({...current,teams:[...current.teams,{id:id(),name:next}]}));setName('');setError('')}
  const rename=(teamId:string)=>{const next=editName.trim();if(!next)return;if(championship.teams.some(team=>team.id!==teamId&&normalize(team.name)===normalize(next))){setError('Cette équipe figure déjà dans le championnat.');return}const ownId=championship.teams.find(team=>team.own)?.id;const linkedIds=championship.rounds.flatMap(round=>round.fixtures.filter(fixture=>(fixture.homeId===ownId&&fixture.awayId===teamId)||(fixture.awayId===ownId&&fixture.homeId===teamId)).map(fixture=>fixture.matchId));update(current=>({...current,championships:(current.championships||[]).map(item=>item.id===championship.id?{...item,teams:item.teams.map(team=>team.id===teamId?{...team,name:next}:team)}:item),matches:current.matches.map(match=>linkedIds.includes(match.id)?{...match,opponent:next}:match)}));setEditing('');setError('')}
  const remove=(teamId:string)=>{if(championship.rounds.some(round=>round.fixtures.some(fixture=>fixture.homeId===teamId||fixture.awayId===teamId))){setError('Cette équipe participe à une rencontre. Retirez d’abord ses rencontres.');return}if(window.confirm('Retirer cette équipe du championnat ?'))modify(current=>({...current,teams:current.teams.filter(team=>team.id!==teamId)}))}
  const savePoints=(event:FormEvent)=>{event.preventDefault();if(Object.values(points).some(value=>!Number.isInteger(value)||value<0)){setError('Les points doivent être des nombres entiers positifs ou nuls.');return}modify(current=>({...current,winPoints:points.win,drawPoints:points.draw,lossPoints:points.loss,tieBreak}));setError('');setMessage('Règles de classement enregistrées.')}
  return <><section className="league-panel"><h3>Championnat</h3><form onSubmit={event=>{event.preventDefault();if(competitionName.trim()&&competitionSeason.trim())modify(current=>({...current,name:competitionName.trim(),season:competitionSeason.trim()}))}}><label className="field"><span>Nom du championnat</span><input required value={competitionName} onChange={event=>setCompetitionName(event.target.value)}/></label><label className="field"><span>Saison</span><SeasonSelect value={competitionSeason} onChange={setCompetitionSeason}/></label><button className="league-outline">Enregistrer le championnat</button></form></section><section className="league-panel"><div className="league-section-heading"><div><h3>Équipes participantes</h3><p>Votre équipe est ajoutée automatiquement. Son nom se modifie dans ses réglages.</p></div><span>{championship.teams.length}</span></div><div className="league-team-list">{championship.teams.map(team=><div key={team.id}>{editing===team.id?<><input aria-label={`Nom de ${team.name}`} value={editName} onChange={event=>setEditName(event.target.value)}/><button onClick={()=>rename(team.id)}>Enregistrer</button><button onClick={()=>setEditing('')}>Annuler</button></>:<><strong>{team.name}{team.own&&<small> Votre équipe</small>}</strong>{!team.own&&<><button onClick={()=>{setEditing(team.id);setEditName(team.name)}}>Modifier</button><button className="league-danger" onClick={()=>remove(team.id)}>Retirer</button></>}</>}</div>)}</div><form className="league-add-team" onSubmit={add}><input aria-label="Nom de la nouvelle équipe" value={name} onChange={event=>setName(event.target.value)} placeholder="Nom de l’équipe"/><button className="primary" disabled={!name.trim()}>＋ Ajouter</button></form></section><ImportMatches data={data} championship={championship} update={update}/><section className="league-panel"><h3>Barème des points</h3><p className="league-hint">Le classement est recalculé après chaque changement.</p><form onSubmit={savePoints}><div className="league-points">{([['win','Victoire'],['draw','Nul'],['loss','Défaite']] as const).map(([key,label])=><label className="field" key={key}><span>{label}</span><input type="number" min="0" step="1" required value={Number.isNaN(points[key])?'':points[key]} onChange={event=>setPoints(current=>({...current,[key]:event.target.value===''?NaN:Number(event.target.value)}))}/></label>)}</div><label className="field"><span>Départage à égalité de points</span><select value={tieBreak} onChange={event=>setTieBreak(event.target.value as ChampionshipTieBreak)}><option value="goalDifference">Différence de buts, puis buts marqués</option><option value="goalsScored">Buts marqués, puis différence de buts</option><option value="pointsOnly">Points uniquement — conserver les égalités</option></select></label><button className="league-outline">Enregistrer les règles</button></form><p className="league-caption">Les pénalités, les forfaits et les confrontations directes ne sont pas pris en compte.</p>{message&&<p className="league-success" role="status">{message}</p>}</section>{error&&<p className="league-error" role="alert">{error}</p>}</>
}

function ChampionshipRounds({data,championship,ownId,update,modify,onOpenMatch}:{data:AppData;championship:Championship;ownId:string;update:Update;modify:(fn:(championship:Championship)=>Championship)=>void;onOpenMatch:(id:string)=>void}) {
  const [adding,setAdding]=useState(false)
  const [number,setNumber]=useState('')
  const [date,setDate]=useState(initialDate)
  const available=roundOptions(championship)
  const add=(event:FormEvent)=>{event.preventDefault();const selected=Number(number);if(!date||!available.includes(selected))return;modify(current=>({...current,rounds:[...current.rounds,{id:id(),name:`Journée ${selected}`,date,fixtures:[]}]}));setNumber('');setAdding(false)}
  return <><div className="league-section-heading"><div><h3>Journées</h3><p>Créez les affiches et renseignez les résultats.</p></div><button className="primary" onClick={()=>{setNumber(String(available[0]||''));setAdding(true)}}>＋ Journée</button></div>{adding&&<form className="league-panel" onSubmit={add}><label className="field"><span>Numéro de la journée</span><select required value={number} onChange={event=>setNumber(event.target.value)}><option value="">Choisir un numéro</option>{available.map(value=><option key={value} value={value}>Journée {value}</option>)}</select></label>{available.length===0&&<p className="league-hint">Tous les numéros disponibles sont déjà utilisés.</p>}<label className="field"><span>Date prévue</span><input required type="date" value={date} onChange={event=>setDate(event.target.value)}/></label><button className="save-button" disabled={!number}>Créer la journée</button><button type="button" className="league-text-button" onClick={()=>setAdding(false)}>Annuler</button></form>}{championship.rounds.length===0&&!adding&&<div className="league-empty">Aucune journée pour le moment. Ajoutez votre première journée.</div>}{orderedRounds(championship.rounds).map(round=><RoundCard key={round.id} data={data} championship={championship} round={round} ownId={ownId} update={update} onOpenMatch={onOpenMatch}/>)}</>

}

function RoundCard({data,championship,round,ownId,update,onOpenMatch}:{data:AppData;championship:Championship;round:ChampionshipRound;ownId:string;update:Update;onOpenMatch:(id:string)=>void}) {
 const [expanded,setExpanded]=useState(true)
 const [adding,setAdding]=useState(false)
 const [editing,setEditing]=useState(false)
 const [roundName,setRoundName]=useState(round.name)
 const [roundDate,setRoundDate]=useState(round.date)
 const [homeId,setHomeId]=useState('')
 const [awayId,setAwayId]=useState('')
 const [matchId,setMatchId]=useState('')
 const [error,setError]=useState('')
 const ownIsHome=homeId===ownId
 const involvesOwn=ownIsHome||awayId===ownId
 const opponentId=ownIsHome?awayId:homeId
 const opponent=championship.teams.find(team=>team.id===opponentId)
 const candidates=involvesOwn&&opponent?data.matches.filter(match=>!match.championshipFixtureId&&match.matchType!=='coupe'&&match.matchType!=='amical'&&match.home===ownIsHome&&normalize(match.opponent)===normalize(opponent.name)):[]
 const editRound=(event:FormEvent)=>{event.preventDefault();if(!roundName.trim()||!roundDate||championship.rounds.some(other=>other.id!==round.id&&roundNumber(other.name)!==undefined&&roundNumber(other.name)===roundNumber(roundName)))return;update(current=>({...current,championships:(current.championships||[]).map(item=>item.id===championship.id?{...item,rounds:item.rounds.map(existing=>existing.id===round.id?{...existing,name:roundName.trim(),date:roundDate}:existing)}:item),matches:current.matches.map(match=>round.fixtures.some(fixture=>fixture.matchId===match.id&&!fixture.date)&&match.date===round.date?{...match,date:roundDate}:match)}));setEditing(false)}
 const addFixture=(event:FormEvent)=>{
  event.preventDefault();setError('')
  if(!homeId||!awayId)return setError('Choisissez les deux équipes.')
  if(homeId===awayId)return setError('Une équipe ne peut pas jouer contre elle-même.')
  if(round.fixtures.some(fixture=>[fixture.homeId,fixture.awayId].some(team=>team===homeId||team===awayId)))return setError('Une équipe joue déjà pendant cette journée.')
  if(candidates.length>0&&!matchId)return setError('Choisissez si vous souhaitez rattacher le match existant ou en créer un nouveau.')
  const selectedMatch=matchId||'new'
  const fixtureId=id()
  let match:Match|undefined
  let scores:{homeScore?:number;awayScore?:number}={}
  if(involvesOwn&&opponent){
    if(selectedMatch!=='new'){
      match=candidates.find(candidate=>candidate.id===selectedMatch)
      if(!match)return setError('Ce match n’est plus disponible. Sélectionnez-le à nouveau.')
      scores=fixtureScoreFromMatch(match,ownIsHome)
      match={...match,matchType:'championnat',championshipFixtureId:fixtureId}
    }else match={id:id(),opponent:opponent.name,date:round.date,time:'',venue:'',home:ownIsHome,calledUp:[],formation:'4-2-3-1',lineup:{},substitutes:[],events:[],matchType:'championnat',championshipFixtureId:fixtureId}
  }
  const linkedMatch=match
  const fixture:ChampionshipFixture={id:fixtureId,homeId,awayId,...scores,...(linkedMatch?{matchId:linkedMatch.id,...(linkedMatch.date!==round.date?{date:linkedMatch.date}:{})}:{})}
  update(current=>({...current,championships:(current.championships||[]).map(item=>item.id===championship.id?{...item,rounds:item.rounds.map(existing=>existing.id===round.id?{...existing,fixtures:[...existing.fixtures,fixture]}:existing)}:item),matches:linkedMatch?(selectedMatch==='new'?[...current.matches,linkedMatch]:current.matches.map(existing=>existing.id===linkedMatch.id?linkedMatch:existing)):current.matches}))
  setHomeId('');setAwayId('');setMatchId('');setAdding(false)
 }
 const removeFixture=(fixture:ChampionshipFixture)=>{if(!window.confirm('Retirer cette rencontre de la journée ? Le classement sera recalculé. Un match lié et son bilan seront conservés dans Matchs.'))return;update(current=>({...current,championships:(current.championships||[]).map(item=>item.id===championship.id?{...item,rounds:item.rounds.map(existing=>existing.id===round.id?{...existing,fixtures:existing.fixtures.filter(value=>value.id!==fixture.id)}:existing)}:item),matches:current.matches.map(match=>{if(match.id!==fixture.matchId)return match;const {championshipFixtureId:_link,...rest}=match;return rest})}))}
 const removeRound=()=>{if(!window.confirm(`Supprimer ${round.name} et ses rencontres du classement ? Les matchs liés et leurs bilans resteront dans Matchs.`))return;update(current=>({...current,championships:(current.championships||[]).map(item=>item.id===championship.id?{...item,rounds:item.rounds.filter(value=>value.id!==round.id)}:item),matches:current.matches.map(match=>{if(!round.fixtures.some(fixture=>fixture.matchId===match.id))return match;const {championshipFixtureId:_link,...rest}=match;return rest})}))}
 return <section className="round-card"><div className="round-head"><button className="round-toggle" onClick={()=>setExpanded(value=>!value)} aria-expanded={expanded}><span><strong>{round.name}</strong><small>{monthLabel(round.date)} · {round.fixtures.length} match{round.fixtures.length!==1?'s':''}</small></span><b>{expanded?'−':'+'}</b></button></div>{expanded&&<div className="round-content">{editing?<form className="league-edit-round" onSubmit={editRound}><label className="field"><span>Numéro de la journée</span><select required value={roundName} onChange={event=>setRoundName(event.target.value)}>{(roundNumber(round.name)===undefined||round.name!==`Journée ${roundNumber(round.name)}`||!roundOptions(championship,round.id).includes(roundNumber(round.name)!))&&<option value={round.name}>{round.name} (nom existant)</option>}{roundOptions(championship,round.id).map(number=><option key={number} value={`Journée ${number}`}>Journée {number}</option>)}</select></label><label className="field"><span>Date</span><input required type="date" value={roundDate} onChange={event=>setRoundDate(event.target.value)}/></label><button className="league-outline">Enregistrer</button><button type="button" className="league-text-button" onClick={()=>setEditing(false)}>Annuler</button></form>:<div className="round-tools"><button onClick={()=>{setRoundName(round.name);setRoundDate(round.date);setEditing(true)}}>Modifier la journée</button><button className="league-danger" onClick={removeRound}>Supprimer la journée</button></div>}{round.fixtures.map(fixture=><FixtureRow key={fixture.id} data={data} championship={championship} round={round} fixture={fixture} ownId={ownId} update={update} remove={()=>removeFixture(fixture)} onOpenMatch={onOpenMatch}/>)}{round.fixtures.length===0&&!adding&&<p className="league-hint">Aucune rencontre ajoutée.</p>}{adding?<form className="fixture-form" onSubmit={addFixture}><label className="field"><span>Domicile</span><select required value={homeId} onChange={event=>{setHomeId(event.target.value);setMatchId('')}}><option value="">Choisir une équipe</option>{championship.teams.map(team=><option key={team.id} value={team.id}>{team.name}</option>)}</select></label><label className="field"><span>Extérieur</span><select required value={awayId} onChange={event=>{setAwayId(event.target.value);setMatchId('')}}><option value="">Choisir une équipe</option>{championship.teams.map(team=><option key={team.id} value={team.id}>{team.name}</option>)}</select></label>{candidates.length>0&&<label className="field"><span>Un match existe déjà dans Matchs</span><select required value={matchId} onChange={event=>setMatchId(event.target.value)}><option value="">Choisir une option</option><option value="new">Créer un nouveau match</option>{candidates.map(match=><option key={match.id} value={match.id}>Rattacher : {match.opponent} · {monthLabel(match.date)}{match.completed?' · terminé':''}</option>)}</select></label>}{involvesOwn&&<p className="league-hint">Votre rencontre sera liée à l’onglet Matchs. Vous pourrez y compléter les convocations et les informations manquantes.</p>}{error&&<p className="league-error" role="alert">{error}</p>}<button className="save-button">Ajouter la rencontre</button><button type="button" className="league-text-button" onClick={()=>{setAdding(false);setError('')}}>Annuler</button></form>:<button className="league-outline add-fixture" onClick={()=>setAdding(true)}>＋ Ajouter un match</button>}</div>}</section>
}

function FixtureRow({data,championship,round,fixture,ownId,update,remove,onOpenMatch}:{data:AppData;championship:Championship;round:ChampionshipRound;fixture:ChampionshipFixture;ownId:string;update:Update;remove:()=>void;onOpenMatch:(id:string)=>void}) {
 const [home,setHome]=useState(fixture.homeScore?.toString()??'')
 const [away,setAway]=useState(fixture.awayScore?.toString()??'')
 const [error,setError]=useState('')
 const [saved,setSaved]=useState(false)
 const [editing,setEditing]=useState(false)
 const [homeId,setHomeId]=useState(fixture.homeId)
 const [awayId,setAwayId]=useState(fixture.awayId)
 const [matchDate,setMatchDate]=useState(fixture.date||round.date)
 useEffect(()=>{setHome(fixture.homeScore?.toString()??'');setAway(fixture.awayScore?.toString()??'')},[fixture.homeScore,fixture.awayScore])
 const linked=data.matches.find(match=>match.id===fixture.matchId)
 const involvesOwn=fixture.homeId===ownId||fixture.awayId===ownId
 const editFixture=(event:FormEvent)=>{
  event.preventDefault();setError('')
  if(!homeId||!awayId||homeId===awayId)return setError('Choisissez deux équipes différentes.')
  if(!matchDate)return setError('Renseignez la date de la rencontre.')
  if(round.fixtures.some(other=>other.id!==fixture.id&&[other.homeId,other.awayId].some(team=>team===homeId||team===awayId)))return setError('Une équipe joue déjà pendant cette journée.')
  if(homeId===fixture.homeId&&awayId===fixture.awayId){update(current=>({...current,championships:(current.championships||[]).map(item=>item.id!==championship.id?item:{...item,rounds:item.rounds.map(existing=>existing.id!==round.id?existing:{...existing,fixtures:existing.fixtures.map(value=>{if(value.id!==fixture.id)return value;const {date:_date,...rest}=value;return matchDate===round.date?rest:{...rest,date:matchDate}})})}),matches:current.matches.map(match=>match.id===linked?.id?{...match,date:matchDate}:match)}));setEditing(false);return}
  if(fixture.homeScore!==undefined||fixture.awayScore!==undefined||linked?.completed||linked?.events.length)return setError('Cette rencontre possède un résultat ou un bilan. Retirez-la puis créez la nouvelle affiche : le match lié et son bilan seront conservés.')
  if(linked?.calledUp.length&&!window.confirm('La feuille de match comporte des convoqués. Confirmer le changement d’affiche ? Les convocations et la composition seront conservées.'))return
  const willInvolveOwn=homeId===ownId||awayId===ownId
  const home=homeId===ownId
  const opponent=championship.teams.find(team=>team.id===(home?awayId:homeId))
  if(willInvolveOwn&&!opponent)return setError('Équipe adverse introuvable.')
  if(willInvolveOwn&&!linked&&data.matches.some(match=>!match.championshipFixtureId&&match.matchType!=='coupe'&&match.matchType!=='amical'&&match.home===home&&normalize(match.opponent)===normalize(opponent!.name)))return setError('Un match existe déjà contre cette équipe. Retirez cette affiche, puis ajoutez-la de nouveau pour pouvoir rattacher le match existant.')
  const linkedMatch=willInvolveOwn?(linked?{...linked,opponent:opponent!.name,home,date:matchDate,lineupValidated:false}:{id:id(),opponent:opponent!.name,date:matchDate,time:'',venue:'',home,calledUp:[],formation:'4-2-3-1' as const,lineup:{},substitutes:[],events:[],matchType:'championnat' as const,championshipFixtureId:fixture.id}):undefined
  update(current=>({...current,championships:(current.championships||[]).map(item=>item.id!==championship.id?item:{...item,rounds:item.rounds.map(existing=>existing.id!==round.id?existing:{...existing,fixtures:existing.fixtures.map(value=>{if(value.id!==fixture.id)return value;const {matchId:_old,date:_date,...rest}=value;return {...rest,homeId,awayId,...(matchDate!==round.date?{date:matchDate}:{}),...(linkedMatch?{matchId:linkedMatch.id}:{})}})} )}),matches:linkedMatch?(linked?current.matches.map(match=>match.id===linked.id?linkedMatch:match):[...current.matches,linkedMatch]):current.matches.map(match=>{if(match.id!==linked?.id)return match;const {championshipFixtureId:_link,...rest}=match;return rest})}))
  setEditing(false)
 }
 const restoreMatch=()=>{
  const ownIsHome=fixture.homeId===ownId
  const opponent=championship.teams.find(team=>team.id===(ownIsHome?fixture.awayId:fixture.homeId))
  if(!opponent)return
  if(!window.confirm('Créer un nouveau match lié à cette rencontre ? Vérifiez d’abord qu’il n’existe pas déjà dans Matchs.'))return
  const match:Match={id:id(),opponent:opponent.name,date:fixture.date||round.date,time:'',venue:'',home:ownIsHome,calledUp:[],formation:'4-2-3-1',lineup:{},substitutes:[],events:[],matchType:'championnat',championshipFixtureId:fixture.id,...(fixture.homeScore!==undefined&&fixture.awayScore!==undefined?{scoreHome:ownIsHome?fixture.homeScore:fixture.awayScore,scoreAway:ownIsHome?fixture.awayScore:fixture.homeScore,completed:true}:{})}
  update(current=>({...current,championships:(current.championships||[]).map(item=>item.id!==championship.id?item:{...item,rounds:item.rounds.map(existing=>existing.id!==round.id?existing:{...existing,fixtures:existing.fixtures.map(value=>value.id===fixture.id?{...value,matchId:match.id}:value)})}),matches:[...current.matches,match]}))
 }
 const save=(event:FormEvent)=>{
  event.preventDefault();setError('');setSaved(false)
  if((home==='')!==(away===''))return setError('Renseignez les deux scores ou laissez les deux vides.')
  const homeScore=home===''?undefined:Number(home),awayScore=away===''?undefined:Number(away)
  if([homeScore,awayScore].some(value=>value!==undefined&&(!Number.isInteger(value)||value<0)))return setError('Les scores doivent être des nombres entiers positifs ou nuls.')
  const changed=fixture.homeScore!==homeScore||fixture.awayScore!==awayScore
  if(changed&&linked?.completed&&linked.events.length&&!window.confirm('Ce match possède des événements joueurs. Modifier le score ne modifie pas les buts et passes déjà enregistrés. Continuer ?'))return
  if(changed&&homeScore===undefined&&fixture.homeScore!==undefined&&!window.confirm('Effacer ce résultat du classement ? Les événements joueurs du match lié seront conservés.'))return
  update(current=>applyFixtureResult(current,championship.id,round.id,fixture.id,homeScore,awayScore));setSaved(true)
 }
 return <article className="fixture-row">{editing?<form className="fixture-edit" onSubmit={editFixture}><label className="field"><span>Domicile</span><select value={homeId} onChange={event=>setHomeId(event.target.value)}>{championship.teams.map(team=><option key={team.id} value={team.id}>{team.name}</option>)}</select></label><label className="field"><span>Extérieur</span><select value={awayId} onChange={event=>setAwayId(event.target.value)}>{championship.teams.map(team=><option key={team.id} value={team.id}>{team.name}</option>)}</select></label><label className="field"><span>Date du match</span><input type="date" required value={matchDate} onChange={event=>setMatchDate(event.target.value)}/></label>{error&&<p className="league-error" role="alert">{error}</p>}<button className="league-outline">Enregistrer l’affiche</button><button type="button" className="league-text-button" onClick={()=>{setEditing(false);setError('')}}>Annuler</button></form>:<form onSubmit={save}><div className="fixture-score"><strong>{championship.teams.find(team=>team.id===fixture.homeId)?.name||'Équipe inconnue'}</strong><input aria-label={`Score domicile ${championship.teams.find(team=>team.id===fixture.homeId)?.name||''}`} type="number" min="0" step="1" inputMode="numeric" placeholder="–" value={home} onChange={event=>{setHome(event.target.value);setSaved(false)}}/><span>–</span><input aria-label={`Score extérieur ${championship.teams.find(team=>team.id===fixture.awayId)?.name||''}`} type="number" min="0" step="1" inputMode="numeric" placeholder="–" value={away} onChange={event=>{setAway(event.target.value);setSaved(false)}}/><strong>{championship.teams.find(team=>team.id===fixture.awayId)?.name||'Équipe inconnue'}</strong></div>{fixture.date&&fixture.date!==round.date&&<p className="league-match-details">Date du match : {monthLabel(fixture.date)}</p>}<div className="fixture-actions"><span>{saved&&home!==''?'Score enregistré':fixture.homeScore!==undefined?'Résultat enregistré':'À jouer'}</span><button className="league-outline">Enregistrer le score</button>{involvesOwn&&(linked?<button type="button" onClick={()=>onOpenMatch(linked.id)}>Voir mon match →</button>:<button type="button" onClick={restoreMatch}>Créer le match lié</button>)}<button type="button" onClick={()=>{setHomeId(fixture.homeId);setAwayId(fixture.awayId);setMatchDate(fixture.date||round.date);setEditing(true);setError('')}}>Modifier</button><button type="button" className="league-danger" onClick={remove}>Retirer</button></div>{error&&<p className="league-error" role="alert">{error}</p>}</form>}</article>
}
