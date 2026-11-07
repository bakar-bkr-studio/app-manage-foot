import type { AppData, Championship, ChampionshipFixture, ChampionshipTeam, Match } from './types'

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
