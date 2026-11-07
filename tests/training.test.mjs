import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { transformWithOxc } from 'vite'
const source=await readFile(new URL('../src/training.ts',import.meta.url),'utf8')
const output=await transformWithOxc(source,'training.ts',{lang:'ts'})
const {assignPlayer,assignmentAttendance,duplicateSession,plannedPlayerIds,confirmPresent}=await import(`data:text/javascript;base64,${Buffer.from(output.code).toString('base64')}`)

test('une équipe préparée en avance ne modifie pas la présence',()=>{
 const attendance={p2:'absent'}
 assert.deepEqual(assignmentAttendance(attendance,'p1','2026-11-08','2026-11-07',true),attendance)
 assert.deepEqual(assignmentAttendance(attendance,'p1','2026-11-07','2026-11-07',true),{p2:'absent',p1:'présent'})
 assert.deepEqual(assignmentAttendance(attendance,'p1','2026-11-07','2026-11-07',false),attendance)
 assert.deepEqual(attendance,{p2:'absent'})
})
test('déplacer un joueur évite de le mettre deux fois dans les équipes du même ensemble',()=>{
 const groups=[{id:'a',name:'Bleus',color:'blue',playerIds:['p1','p2']},{id:'b',name:'Rouges',color:'red',playerIds:['p3']}]
 const result=assignPlayer(groups,'b','p1')
 assert.deepEqual(result.map(group=>group.playerIds),[['p2'],['p3','p1']])
 assert.deepEqual(groups[0].playerIds,['p1','p2'])
})
test('dupliquer copie la préparation sans reprendre les présences ni les incidents',()=>{
 const source={id:'old',title:'Séance',date:'2026-11-01',time:'18:00',attendance:{p1:'présent'},incidents:{p1:'Genou'},preparation:{theme:'Passes',objective:'',blocks:[],groups:[{id:'g',name:'Bleus',color:'blue',playerIds:['p1']}]}}
 const copy=duplicateSession(source,'new','2026-11-08','19:00','Nouvelle')
 assert.deepEqual(copy.attendance,{})
 assert.equal(copy.incidents,undefined)
 assert.deepEqual(copy.preparation,source.preparation)
 copy.preparation.groups[0].playerIds.push('p2')
 assert.deepEqual(source.preparation.groups[0].playerIds,['p1'])
})


test('le pointage confirmé ne change que les joueurs sélectionnés et les groupes utilisés sont dédoublonnés',()=>{
 const groups=[{id:'g1',name:'Bleus',color:'blue',playerIds:['p1','p2']}]
 const preparation={theme:'',objective:'',groups,blocks:[{id:'b1',name:'Atelier',minutes:15,notes:'',groupMode:'custom',groups:[{id:'g2',name:'Rouges',color:'red',playerIds:['p2','p3']}]},{id:'b2',name:'Libre',minutes:10,notes:'',groupMode:'none',groups:[{id:'g3',name:'Ancien',color:'green',playerIds:['p4']}]}]}
 assert.deepEqual(plannedPlayerIds(preparation),['p1','p2','p3'])
 const original={p2:'absent',p3:'excusé'}
 assert.deepEqual(confirmPresent(original,['p1','p3']),{p1:'présent',p2:'absent',p3:'présent'})
 assert.deepEqual(original,{p2:'absent',p3:'excusé'})
})
