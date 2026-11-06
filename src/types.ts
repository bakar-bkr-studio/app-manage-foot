export type Availability = 'disponible' | 'indisponible' | 'blessé'
export type Attendance = 'présent' | 'absent' | 'blessé' | 'excusé'
export type Position = 'GB' | 'DC' | 'DD' | 'DG' | 'MDC' | 'MC' | 'MOC' | 'AD' | 'AG' | 'BU'

export interface Player {
  id: string; firstName: string; lastName: string; number: number; mainPosition: Position; secondaryPosition?: Position
  availability: Availability; active: boolean; note?: string
}
export interface Session { id: string; title: string; date: string; time: string; attendance: Record<string, Attendance> }
export interface Match {
  id: string; opponent: string; date: string; time: string; venue: string; home: boolean; calledUp: string[]; formation: '4-4-2' | '4-2-3-1'; lineup: Record<string, string>; substitutes: string[]
  scoreHome?: number; scoreAway?: number; summary?: string; events: MatchEvent[]; completed?: boolean
}
export interface MatchEvent { id: string; type: 'but' | 'passe' | 'jaune' | 'rouge' | 'entrée' | 'sortie'; playerId: string; minute?: number }
export interface TeamProfile {
  name: string; category: string; season: string; onboardingCompleted: boolean
}
export interface AppData { team?: TeamProfile; players: Player[]; sessions: Session[]; matches: Match[] }
