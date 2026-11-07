export type Availability = 'disponible' | 'indisponible' | 'blessé'
export type Attendance = 'présent' | 'absent' | 'blessé' | 'excusé'
export type Position = 'GB' | 'DC' | 'DD' | 'DG' | 'MDC' | 'MC' | 'MOC' | 'AD' | 'AG' | 'BU'

export interface Player {
  id: string; firstName: string; lastName: string; number?: number; mainPosition: Position; secondaryPosition?: Position
  availability: Availability; active: boolean; note?: string
}
export interface TrainingGroup { id: string; name: string; color: 'blue'|'red'|'orange'|'green'|'purple'; playerIds: string[] }
export interface TrainingBlock { id: string; name: string; minutes: number; notes: string; groupMode: 'session'|'custom'|'none'; groups: TrainingGroup[] }
export interface TrainingPreparation { theme: string; objective: string; blocks: TrainingBlock[]; groups: TrainingGroup[] }
export interface Session { id: string; title: string; date: string; time: string; attendance: Record<string, Attendance>; preparation?: TrainingPreparation; incidents?: Record<string,string> }
export type MatchType = 'championnat' | 'coupe' | 'amical'
export interface Match {
  id: string; opponent: string; date: string; time: string; venue: string; home: boolean; calledUp: string[]; formation: '4-4-2' | '4-2-3-1' | '3-5-2' | '3-4-3'; lineup: Record<string, string>; substitutes: string[]
  scoreHome?: number; scoreAway?: number; summary?: string; events: MatchEvent[]; completed?: boolean; lineupValidated?: boolean; championshipFixtureId?: string; matchType?: MatchType
}
export interface MatchEvent { id: string; type: 'but' | 'passe' | 'jaune' | 'rouge' | 'entrée' | 'sortie'; playerId: string; minute?: number }
export interface TeamProfile {
  name: string; category: string; season: string; onboardingCompleted: boolean; club?: string
}
export interface CoachProfile { firstName: string; lastName: string }
export interface TeamRecord { id: string; data: AppData }
export interface ChampionshipTeam { id: string; name: string; own?: boolean }
export interface ChampionshipFixture { id: string; homeId: string; awayId: string; date?: string; homeScore?: number; awayScore?: number; matchId?: string }
export interface ChampionshipRound { id: string; name: string; date: string; fixtures: ChampionshipFixture[] }
export type ChampionshipTieBreak = 'goalDifference' | 'goalsScored' | 'pointsOnly'
export interface Championship { id: string; name: string; season: string; winPoints: number; drawPoints: number; lossPoints: number; tieBreak?: ChampionshipTieBreak; teams: ChampionshipTeam[]; rounds: ChampionshipRound[] }
export interface AppData { team?: TeamProfile; players: Player[]; sessions: Session[]; matches: Match[]; championships?: Championship[] }
