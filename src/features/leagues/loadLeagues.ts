import { summarizeLeague } from '../../domain/league';
import type { Services } from '../../services';
import type { SavedAccount } from '../../storage/prefs';

/** Current NFL state plus the owner's leagues for the current season (shared by both tabs). */
export async function loadMyLeagues(services: Services, account: SavedAccount, force: boolean) {
  const state = await services.cached('state:nfl', () => services.api.getNflState(), force);
  const season = state.data.league_season || state.data.season;
  const leagues = await services.cached(`leagues:${account.userId}:${season}`, () => services.api.getUserLeagues(account.userId, season), force);
  return { state: state.data, season, leagues: leagues.data.map(summarizeLeague), fetchedAt: leagues.fetchedAt };
}
