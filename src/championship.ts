import type { AppData, Championship, ChampionshipFixture, ChampionshipTeam, Match } from './types'

export interface MatchChampionshipLink { championshipId: string; roundId: string; opponentId: string; fixtureId: string }

/** Create the match and its fixture together, or attach it to a fixture without a match. */
export function addMatchWithChampionship(data:AppData,match:Match,link?:MatchChampionshipLink):AppData {
  if(!link)return {...data,matches:[match,...data.matches]}
  if(match.matchType!=='championnat')throw new Error('Seul un match de championnat peut être lié au classement.')
  const championship=data.championships?.find(item=>item.id===link.championshipId)
  const round=championship?.rounds.find(item=>item.id===link.roundId)
  const own=championship?.teams.find(team=>team.own)
  const opponent=championship?.teams.find(team=>team.id===link.opponentId&&!team.own)
  if(!championship||!round||!own||!opponent)throw new Error('Le championnat, la journée ou l’équipe adverse n’existe plus. Actualisez votre choix.')
  const homeId=match.home?own.id:opponent.id,awayId=match.home?opponent.id:own.id
  const ownFixture=round.fixtures.find(fixture=>fixture.homeId===own.id||fixture.awayId===own.id)
  if(ownFixture&&(ownFixture.homeId!==homeId||ownFixture.awayId!==awayId))throw new Error('Votre équipe a déjà une autre rencontre dans cette journée. Ouvrez cette rencontre pour la modifier.')
  if(ownFixture?.matchId)throw new Error('Un match est déjà lié à cette journée. Ouvrez-le depuis le championnat pour éviter un doublon.')
  if(!ownFixture&&round.fixtures.some(fixture=>fixture.homeId===opponent.id||fixture.awayId===opponent.id))throw new Error('Cette équipe adverse joue déjà dans cette journée.')
  const fixtureId=ownFixture?.id||link.fixtureId
  const withScore=ownFixture?.homeScore!==undefined&&ownFixture.awayScore!==undefined
    ? {scoreHome:match.home?ownFixture.homeScore:ownFixture.awayScore,scoreAway:match.home?ownFixture.awayScore:ownFixture.homeScore,completed:true} : {}
  const linkedMatch:Match={...match,...withScore,opponent:opponent.name,matchType:'championnat',championshipFixtureId:fixtureId}
  const {date:_oldDate,...previousFixture}=ownFixture||{id:fixtureId,homeId,awayId}
  const fixture:ChampionshipFixture={...previousFixture,matchId:match.id,...(match.date!==round.date?{date:match.date}:{})}
  return {...data,matches:[linkedMatch,...data.matches],championships:(data.championships||[]).map(item=>item.id!==championship.id?item:{...item,rounds:item.rounds.map(day=>day.id!==round.id?day:{...day,fixtures:ownFixture?day.fixtures.map(existing=>existing.id===ownFixture.id?fixture:existing):[...day.fixtures,fixture]})})}
}

/** Link an existing match without replacing its players, lineup or report. */
export function attachExistingMatch(data:AppData,championshipId:string,roundId:string,matchId:string,fixtureId:string,replaceEmptyDraft=false):AppData {
  const championship=data.championships?.find(item=>item.id===championshipId)
  const round=championship?.rounds.find(item=>item.id===roundId)
  const own=championship?.teams.find(team=>team.own)
  const match=data.matches.find(item=>item.id===matchId)
  if(!championship||!round||!own||!match)throw new Error('Le championnat, la journée ou le match n’existe plus.')
  if(match.championshipFixtureId)throw new Error('Ce match est déjà lié à une journée.')
  if(match.matchType==='coupe'||match.matchType==='amical')throw new Error('Ce match est indiqué comme match de coupe ou amical.')
  const normalize=(value:string)=>value.trim().toLocaleLowerCase('fr-FR')
  const opponent=championship.teams.find(team=>!team.own&&normalize(team.name)===normalize(match.opponent))
  if(!opponent)throw new Error('Ajoutez d’abord cet adversaire aux équipes du championnat avec le même nom.')
  const homeId=match.home?own.id:opponent.id,awayId=match.home?opponent.id:own.id
  const existing=round.fixtures.find(fixture=>fixture.homeId===own.id||fixture.awayId===own.id)
  if(existing&&(existing.homeId!==homeId||existing.awayId!==awayId))throw new Error('Votre équipe a déjà une autre affiche dans cette journée.')
  if(!existing&&round.fixtures.some(fixture=>fixture.homeId===opponent.id||fixture.awayId===opponent.id))throw new Error('Cet adversaire joue déjà dans cette journée.')
  const draft=existing?.matchId?data.matches.find(item=>item.id===existing.matchId):undefined
  if(draft?.id===match.id)throw new Error('Ce match est déjà associé à cette journée. Actualisez la page avant de continuer.')
  if(draft){
    const mirroredScore=existing?.homeScore!==undefined&&existing.awayScore!==undefined&&draft.completed&&draft.scoreHome===(draft.home?existing.homeScore:existing.awayScore)&&draft.scoreAway===(draft.home?existing.awayScore:existing.homeScore)
    const noScore=!draft.completed&&draft.scoreHome===undefined&&draft.scoreAway===undefined
    const empty=(noScore||mirroredScore)&&!draft.calledUp.length&&!Object.keys(draft.lineup).length&&!draft.substitutes.length&&!draft.events.length&&!draft.venue&&!draft.time&&!draft.summary&&!draft.lineupValidated
    if(!empty)throw new Error('Cette journée est déjà liée à un match qui contient des informations. Ouvrez-le pour vérifier avant de le remplacer.')
    if(!replaceEmptyDraft)throw new Error('Un brouillon vide est déjà lié à cette journée. Confirmez son remplacement pour continuer.')
  }
  const fromMatch=fixtureScoreFromMatch(match,match.home)
  const fixtureHasScore=existing?.homeScore!==undefined&&existing.awayScore!==undefined
  if(fixtureHasScore&&fromMatch.homeScore!==undefined&&(existing.homeScore!==fromMatch.homeScore||existing.awayScore!==fromMatch.awayScore))throw new Error('Le score de la journée diffère du bilan du match. Corrigez d’abord le score avant de les rattacher.')
  const id=existing?.id||fixtureId
  const score=fixtureHasScore&&fromMatch.homeScore===undefined?{scoreHome:match.home?existing.homeScore:existing.awayScore,scoreAway:match.home?existing.awayScore:existing.homeScore,completed:true}:{}
  const linked:Match={...match,...score,matchType:'championnat',championshipFixtureId:id}
  const {date:_date,...previous}=existing||{id,homeId,awayId}
  const fixture:ChampionshipFixture={...previous,...(!fixtureHasScore?fromMatch:{}),matchId:match.id,...(match.date!==round.date?{date:match.date}:{})}
  return {...data,matches:data.matches.filter(item=>item.id!==draft?.id).map(item=>item.id===match.id?linked:item),championships:(data.championships||[]).map(item=>item.id!==championshipId?item:{...item,rounds:item.rounds.map(day=>day.id!==roundId?day:{...day,fixtures:existing?day.fixtures.map(value=>value.id===id?fixture:value):[...day.fixtures,fixture]})})}
}

export interface Standing { team: ChampionshipTeam; played: number; won: number; drawn: number; lost: number; goalsFor: number; goalsAgainst: number; points: number; rank: number }

export function calculateStandings(championship: Championship): Standing[] {
  const rows=championship.teams.map(team=>({team,played:0,won:0,drawn:0,lost:0,goalsFor:0,goalsAgainst:0,points:0,rank:0}))
  const byId=new Map(rows.map(row=>[row.team.id,row]))
  for(const round of championship.rounds) for(const fixture of round.fixtures) {
    if(fixture.homeScore===undefined||fixture.awayScore===undefined)continue
    const home=byId.get(fixture.homeId),away=byId.get(fixture.awayId)
    if(!home||!away)continue
    const a=fixture.homeScore,b=fixture.awayScore
    home.played++;away.played++;home.goalsFor+=a;home.goalsAgainst+=b;away.goalsFor+=b;away.goalsAgainst+=a
    if(a>b){home.won++;away.lost++;home.points+=championship.winPoints;away.points+=championship.lossPoints}
    else if(a<b){away.won++;home.lost++;away.points+=championship.winPoints;home.points+=championship.lossPoints}
    else{home.drawn++;away.drawn++;home.points+=championship.drawPoints;away.points+=championship.drawPoints}
  }
  const difference=(row:Standing)=>row.goalsFor-row.goalsAgainst
  const tieBreak=championship.tieBreak||'goalDifference'
  const compareCriteria=(a:Standing,b:Standing)=>tieBreak==='pointsOnly'?0:tieBreak==='goalsScored'?b.goalsFor-a.goalsFor||difference(b)-difference(a):difference(b)-difference(a)||b.goalsFor-a.goalsFor
  rows.sort((a,b)=>b.points-a.points||compareCriteria(a,b)||a.team.name.localeCompare(b.team.name,'fr'))
  rows.forEach((row,index)=>{const previous=rows[index-1];row.rank=previous&&previous.points===row.points&&compareCriteria(previous,row)===0?previous.rank:index+1})
  return rows
}

// Match.scoreHome/scoreAway sont historiquement « notre équipe / adversaire ».
export function fixtureScoreFromMatch(match:Match,ownIsHome:boolean):{homeScore?:number;awayScore?:number} {
  if(!match.completed||match.scoreHome===undefined||match.scoreAway===undefined)return {}
  return ownIsHome?{homeScore:match.scoreHome,awayScore:match.scoreAway}:{homeScore:match.scoreAway,awayScore:match.scoreHome}
}

export function applyFixtureResult(data:AppData,championshipId:string,roundId:string,fixtureId:string,homeScore:number|undefined,awayScore:number|undefined):AppData {
  let linked:ChampionshipFixture|undefined
  let ownId=''
  const championships=(data.championships||[]).map(championship=>{
    if(championship.id!==championshipId)return championship
    ownId=championship.teams.find(team=>team.own)?.id||''
    return {...championship,rounds:championship.rounds.map(round=>round.id!==roundId?round:{...round,fixtures:round.fixtures.map(fixture=>{
      if(fixture.id!==fixtureId)return fixture
      const {homeScore:_home,awayScore:_away,...rest}=fixture
      linked=homeScore===undefined||awayScore===undefined?rest:{...rest,homeScore,awayScore}
      return linked
    })})}
  })
  const result=linked as ChampionshipFixture|undefined
  const matches=result?.matchId?data.matches.map(match=>{
    if(match.id!==result.matchId)return match
    if(homeScore===undefined||awayScore===undefined){const {scoreHome:_home,scoreAway:_away,...rest}=match;return {...rest,completed:false}}
    const ownIsHome=result.homeId===ownId
    return {...match,scoreHome:ownIsHome?homeScore:awayScore,scoreAway:ownIsHome?awayScore:homeScore,completed:true}
  }):data.matches
  return {...data,championships,matches}
}

export function applyMatchResult(data:AppData,match:Match):AppData {
  const matches=data.matches.map(item=>item.id===match.id?match:item)
  if(!match.championshipFixtureId)return {...data,matches}
  const championships=(data.championships||[]).map(championship=>{
    const ownId=championship.teams.find(team=>team.own)?.id
    return {...championship,rounds:championship.rounds.map(round=>({...round,fixtures:round.fixtures.map(fixture=>{
      if(fixture.id!==match.championshipFixtureId||fixture.matchId!==match.id)return fixture
      const {homeScore:_home,awayScore:_away,...rest}=fixture
      return {...rest,...fixtureScoreFromMatch(match,fixture.homeId===ownId)}
    })}))}
  })
  return {...data,matches,championships}
}
