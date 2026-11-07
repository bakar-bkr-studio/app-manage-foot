import type { Attendance, Session, TrainingGroup, TrainingPreparation } from './types'
export const emptyPreparation=():TrainingPreparation=>({theme:'',objective:'',blocks:[],groups:[]})
export const localDay=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
export function assignPlayer(groups:TrainingGroup[],groupId:string,playerId:string):TrainingGroup[]{
 return groups.map(group=>({...group,playerIds:group.id===groupId?[...group.playerIds.filter(id=>id!==playerId),playerId]:group.playerIds.filter(id=>id!==playerId)}))
}
/** A planned assignment never changes attendance; on the session day the user confirms conflicts first. */
export function assignmentAttendance(attendance:Record<string,Attendance>,playerId:string,sessionDate:string,today:string,live:boolean):Record<string,Attendance>{
 return live&&sessionDate===today?{...attendance,[playerId]:'présent'}:attendance
}

/** Collecte les joueurs prévus dans les équipes utilisées, une seule fois par séance. */
export function plannedPlayerIds(preparation:TrainingPreparation):string[]{
 const groups=[...preparation.groups,...preparation.blocks.filter(block=>block.groupMode==='custom').flatMap(block=>block.groups)]
 return [...new Set(groups.flatMap(group=>group.playerIds))]
}
export function confirmPresent(attendance:Record<string,Attendance>,playerIds:string[]):Record<string,Attendance>{
 const next={...attendance}
 for(const id of playerIds)next[id]='présent'
 return next
}
export function duplicateSession(source:Session,id:string,date:string,time:string,title:string):Session{
 return {id,date,time,title,attendance:{},...(source.preparation?{preparation:structuredClone(source.preparation)}:{})}
}
