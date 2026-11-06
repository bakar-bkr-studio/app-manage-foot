import { collection, doc, onSnapshot, runTransaction, setDoc, type Unsubscribe } from 'firebase/firestore'
import { firebaseAuth, firestore } from './firebase'
import type { AppData, CoachProfile, Player, Position, TeamProfile, TeamRecord } from './types'

const key = 'coachboard-u18-data-v1'
const roster: Array<[string, string, number, Position, Position?, Player['availability']?]> = [
  ['Lucas','Bernard',1,'GB',undefined,'disponible'], ['Mathis','Leroy',2,'DD','DC','disponible'], ['Nolan','Roux',3,'DC','MDC','disponible'],
  ['Adam','Morel',4,'DC','DG','blessé'], ['Yanis','Petit',5,'DG','DC','disponible'], ['Théo','Martin',6,'MDC','MC','disponible'],
  ['Enzo','Garcia',7,'MC','MOC','disponible'], ['Sacha','Dubois',8,'MC','MDC','indisponible'], ['Ilyes','Robert',9,'AD','AG','disponible'],
  ['Noah','Simon',10,'MOC','MC','disponible'], ['Raphaël','Laurent',11,'AG','AD','disponible'], ['Hugo','Legrand',12,'BU','MOC','disponible'],
  ['Louis','Michel',13,'GB',undefined,'disponible'], ['Ethan','Faure',14,'DC','DD','disponible'], ['Kylian','Benoit',15,'BU','AG','disponible'], ['Tom','Vidal',16,'MC','MOC','disponible']
]
const players: Player[] = roster.map(([firstName,lastName,number,mainPosition,secondaryPosition,availability], index) => ({ id: `p${index+1}`, firstName, lastName, number, mainPosition, secondaryPosition, availability: availability || 'disponible', active: true }))
const today = new Date(); const plusDays = (days: number) => { const d = new Date(today); d.setDate(d.getDate()+days); return d.toISOString().slice(0,10) }
export const demoData: AppData = {
  team: { name: 'CoachBoard', category: 'U18', season: '2026–27', onboardingCompleted: true },
  players,
  sessions: [{ id: 's1', title: 'Séance technique', date: plusDays(1), time: '18:30', attendance: { p1:'présent',p2:'présent',p3:'présent',p4:'blessé',p5:'présent',p6:'présent',p7:'présent',p8:'excusé' }}],
  matches: [{ id: 'm1', opponent: 'AS Montchat', date: plusDays(4), time: '15:00', venue: 'Stade des Cèdres', home: true, calledUp: players.filter(p=>p.availability==='disponible').slice(0,14).map(p=>p.id), formation:'4-2-3-1', lineup: { GB:'p1',DD:'p2',DC1:'p3',DC2:'p14',DG:'p5',MDC1:'p6',MDC2:'p7',AD:'p9',MOC:'p10',AG:'p11',BU:'p12' }, substitutes:['p13','p15','p16'], events: [] }]
}

export const emptyAppData = (): AppData => ({
  team: { name: '', category: 'U18', season: '2026–27', onboardingCompleted: false },
  players: [], sessions: [], matches: [],
})

export const repository = {
  load(scope = 'demo'): AppData { try { const saved = localStorage.getItem(`${key}-${scope}`); if (saved) return JSON.parse(saved) as AppData } catch { /* use seed */ } return scope === 'demo' ? structuredClone(demoData) : emptyAppData() },
  save(data: AppData, scope = 'demo') { localStorage.setItem(`${key}-${scope}`, JSON.stringify(data)) },
  reset() { localStorage.removeItem(`${key}-demo`); return structuredClone(demoData) }
}

/** L'équipe historique reste dans teams/{uid}; les autres sont isolées sous users/{uid}. */
export const cloudRepository = {
  subscribeProfile(userId:string, onData:(profile:CoachProfile|null)=>void, onError:(error:Error)=>void):Unsubscribe {
    if (!firestore) throw new Error('Connexion Firebase impossible.')
    return onSnapshot(doc(firestore,'users',userId), {includeMetadataChanges:true}, snapshot => {
      if(!snapshot.exists()&&snapshot.metadata.fromCache)return
      const data=snapshot.data()
      onData(typeof data?.firstName==='string' && typeof data?.lastName==='string' && data.firstName.trim() && data.lastName.trim() ? {firstName:data.firstName,lastName:data.lastName} : null)
    }, onError)
  },
  subscribeTeams(userId:string, onData:(teams:TeamRecord[])=>void, onError:(error:Error)=>void):Unsubscribe {
    if (!firestore) throw new Error('Connexion Firebase impossible.')
    let legacy:TeamRecord|undefined, additional:TeamRecord[]=[]
    let legacyReady=false, additionalReady=false
    const emit=()=>{if(legacyReady&&additionalReady)onData([...(legacy?[legacy]:[]),...additional])}
    const fromData=(id:string, value:Record<string,unknown>):TeamRecord=>({id,data:{team:value.team as TeamProfile|undefined,players:Array.isArray(value.players)?value.players:[],sessions:Array.isArray(value.sessions)?value.sessions:[],matches:Array.isArray(value.matches)?value.matches:[]} as AppData})
    const stopLegacy=onSnapshot(doc(firestore,'teams',userId),{includeMetadataChanges:true},snapshot=>{
      if(!snapshot.exists()&&snapshot.metadata.fromCache)return
      legacyReady=true
      legacy=snapshot.exists()?fromData(userId,snapshot.data()):undefined
      emit()
    },onError)
    const stopAdditional=onSnapshot(collection(firestore,'users',userId,'teams'),{includeMetadataChanges:true},snapshot=>{
      if(snapshot.empty&&snapshot.metadata.fromCache)return
      additionalReady=true
      additional=snapshot.docs.map(item=>fromData(item.id,item.data())).sort((a,b)=>(a.data.team?.name||'').localeCompare(b.data.team?.name||''))
      emit()
    },onError)
    return ()=>{stopLegacy();stopAdditional()}
  },
  async saveProfile(profile:CoachProfile) {
    const user=firebaseAuth?.currentUser
    if(!user||!firestore)throw new Error('Connexion Firebase impossible.')
    await setDoc(doc(firestore,'users',user.uid),profile,{merge:true})
  },
  async createFirstTeam(team:TeamProfile) {
    const user=firebaseAuth?.currentUser
    if(!user||!firestore)throw new Error('Connexion Firebase impossible.')
    const reference=doc(firestore,'teams',user.uid)
    await runTransaction(firestore,async transaction=>{
      const existing=await transaction.get(reference)
      if(existing.exists()) {
        if(existing.data().team?.onboardingCompleted) throw new Error('Cette équipe existe déjà. Rechargez la page pour la retrouver.')
        transaction.set(reference,{team,ownerId:user.uid,schemaVersion:2},{merge:true})
      } else transaction.set(reference,{...emptyAppData(),team,ownerId:user.uid,schemaVersion:2})
    })
  },
  async createTeam(team:TeamProfile):Promise<string> {
    const user = firebaseAuth?.currentUser
    if(!user||!firestore)throw new Error('Connexion Firebase impossible.')
    const reference=doc(collection(firestore,'users',user.uid,'teams'))
    await setDoc(reference,{...emptyAppData(),team,ownerId:user.uid,schemaVersion:2})
    return reference.id
  },
  async save(teamId:string,data:AppData) {
    const user=firebaseAuth?.currentUser
    if(!user||!firestore)throw new Error('Connexion Firebase impossible.')
    const reference=teamId===user.uid?doc(firestore,'teams',user.uid):doc(firestore,'users',user.uid,'teams',teamId)
    await setDoc(reference,{...data,ownerId:user.uid,schemaVersion:2},{merge:true})
  },
}
