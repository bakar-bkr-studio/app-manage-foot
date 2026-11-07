import { useState } from 'react'
import { attachExistingMatch } from './championship'
import type { AppData, Championship, Match } from './types'

type Update=(fn:(data:AppData)=>AppData)=>void
const normalize=(value:string)=>value.trim().toLocaleLowerCase('fr-FR')
const dateLabel=(value:string)=>new Date(`${value}T12:00`).toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'numeric'})
const isEligible=(match:Match)=>match.matchType!=='coupe'&&match.matchType!=='amical'

export function ImportMatches({data,championship,update}:{data:AppData;championship:Championship;update:Update}) {
  const [open,setOpen]=useState(false)
  const [selected,setSelected]=useState<string[]>([])
  const [rounds,setRounds]=useState<Record<string,string>>({})
  const [error,setError]=useState('')
  const [message,setMessage]=useState('')
  const existingNames=new Set(championship.teams.map(team=>normalize(team.name)))
  const names=new Map<string,string>()
  for(const match of data.matches){const name=match.opponent.trim(),key=normalize(name);if(name&&isEligible(match)&&!existingNames.has(key)&&!names.has(key))names.set(key,name)}
  const suggestions=[...names.values()].sort((a,b)=>a.localeCompare(b,'fr'))
  const matches=[...data.matches].filter(match=>isEligible(match)&&!match.championshipFixtureId).sort((a,b)=>b.date.localeCompare(a.date))
  const addTeams=()=>{
    const selectedNames=selected.map(name=>name.trim()).filter(Boolean)
    if(!selectedNames.length)return
    update(current=>({...current,championships:(current.championships||[]).map(item=>{
      if(item.id!==championship.id)return item
      const keys=new Set(item.teams.map(team=>normalize(team.name)))
      const added=selectedNames.filter(name=>{const key=normalize(name);if(keys.has(key))return false;keys.add(key);return true}).map(name=>({id:crypto.randomUUID(),name}))
      return {...item,teams:[...item.teams,...added]}
    })}))
    setMessage('Adversaires ajoutés. Vous pouvez maintenant rattacher les matchs aux journées.');setSelected([]);setOpen(false);setError('')
  }
  const attach=(match:Match)=>{
    const roundId=rounds[match.id]
    if(!roundId){setError('Choisissez la journée correspondant à ce match.');return}
    const round=championship.rounds.find(item=>item.id===roundId)
    try {
      const fixtureId=crypto.randomUUID()
      const preview=attachExistingMatch(data,championship.id,roundId,match.id,fixtureId,true)
      const replacesDraft=preview.matches.length<data.matches.length
      const text=`Rattacher le match contre ${match.opponent} du ${dateLabel(match.date)} à ${round?.name||'cette journée'} ?${replacesDraft?' Le match généré sans feuille ni bilan détaillé sera remplacé ; les scores, votre feuille et votre bilan existants seront conservés.':''}`
      if(!window.confirm(text))return
      update(current=>attachExistingMatch(current,championship.id,roundId,match.id,fixtureId,true))
      setMessage(`Match contre ${match.opponent} rattaché à ${round?.name||'la journée'}.`);setError('');setRounds(current=>({...current,[match.id]:''}))
    }catch(reason){setError(reason instanceof Error?reason.message:'Impossible de rattacher le match.')}
  }
  return <><section className="league-panel"><h3>Importer les adversaires</h3><p className="league-hint">Retrouvez les noms déjà saisis dans Matchs. Vérifiez les propositions : certains anciens matchs peuvent être amicaux ou appartenir à une autre saison.</p>{suggestions.length===0?<p className="league-hint">Aucun nouvel adversaire à proposer.</p>:!open?<button className="league-outline" onClick={()=>{setOpen(true);setMessage('');setError('')}}>Choisir parmi {suggestions.length} adversaire{suggestions.length!==1?'s':''}</button>:<><div className="import-choice-list">{suggestions.map(name=><label key={name}><input type="checkbox" checked={selected.includes(name)} onChange={event=>setSelected(current=>event.target.checked?[...current,name]:current.filter(value=>value!==name))}/><span>{name}</span></label>)}</div><div className="import-actions"><button type="button" onClick={()=>setSelected(suggestions)}>Tout sélectionner</button><button type="button" className="league-outline" disabled={!selected.length} onClick={addTeams}>Importer ({selected.length})</button><button type="button" onClick={()=>{setOpen(false);setSelected([])}}>Annuler</button></div></>}{message&&<p className="league-success" role="status">{message}</p>}</section><section className="league-panel"><h3>Rattacher des matchs existants</h3><p className="league-hint">Choisissez une journée pour chaque match de championnat. Les matchs anciens sans type sont proposés à vérifier ; les matchs amicaux et de coupe sont exclus.</p>{matches.length===0?<p className="league-hint">Aucun match à rattacher.</p>:championship.rounds.length===0?<p className="league-hint">Créez d’abord une journée dans l’onglet Journées.</p>:<div className="import-match-list">{matches.map(match=>{const known=championship.teams.some(team=>!team.own&&normalize(team.name)===normalize(match.opponent));return <article key={match.id}><div><strong>{match.home?'Domicile':'Extérieur'} · {match.opponent}</strong><small>{dateLabel(match.date)}{match.completed&&match.scoreHome!==undefined&&match.scoreAway!==undefined?` · ${match.scoreHome}–${match.scoreAway}`:' · À jouer'}{!match.matchType?' · Type à vérifier':''}</small></div>{known?<div className="import-attach"><select aria-label={`Journée pour ${match.opponent} du ${dateLabel(match.date)}`} value={rounds[match.id]||''} onChange={event=>setRounds(current=>({...current,[match.id]:event.target.value}))}><option value="">Choisir une journée</option>{championship.rounds.map(round=><option key={round.id} value={round.id}>{round.name} · {dateLabel(round.date)}</option>)}</select><button className="league-outline" onClick={()=>attach(match)}>Rattacher</button></div>:<p className="league-hint">Ajoutez d’abord cet adversaire à la liste des équipes.</p>}</article>})}</div>}{error&&<p className="league-error" role="alert">{error}</p>}</section></>
}
