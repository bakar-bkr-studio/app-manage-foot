import { doc, onSnapshot, setDoc, type Unsubscribe } from 'firebase/firestore'
import { firebaseAuth, firestore } from './firebase'
import type { AppData, Player, Position } from './types'

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

/** Les données d'une équipe sont regroupées dans teams/{teamId}, en temps réel. */
export const cloudRepository = {
  async subscribe(onData: (data: AppData) => void, onError: (error: Error) => void): Promise<Unsubscribe | undefined> {
    if (!firebaseAuth || !firestore) return undefined
    try {
      const user = firebaseAuth.currentUser
      if (!user) throw new Error('Connexion Firebase impossible.')
      const team = doc(firestore, 'teams', user.uid)
      return onSnapshot(team, async snapshot => {
        const saved = snapshot.data()
        if (!snapshot.exists() || !Array.isArray(saved?.players)) {
          try { await setDoc(team, { ...emptyAppData(), ownerId: user.uid, schemaVersion: 2 }) }
          catch (error) { onError(error instanceof Error ? error : new Error('Création de l’équipe impossible.')) }
          return
        }
        const { ownerId: _ownerId, schemaVersion: _schemaVersion, ...data } = saved
        onData(data as AppData)
      }, error => onError(error))
    } catch (error) {
      onError(error instanceof Error ? error : new Error('Connexion à Firestore impossible.'))
      return undefined
    }
  },
  async save(data: AppData) {
    const user = firebaseAuth?.currentUser
    if (!user || !firestore) return
    await setDoc(doc(firestore, 'teams', user.uid), { ...data, ownerId: user.uid, schemaVersion: 2 }, { merge: true })
  },
}
