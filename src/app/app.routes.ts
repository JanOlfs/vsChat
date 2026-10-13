import { Routes } from '@angular/router';
import { Shell } from './shell/shell';
import { Start } from './pages/start/start';
import { Home } from './pages/home/home';
import { Profile } from './pages/profile/profile';
import { AuthCallback } from './pages/auth-callback/auth-callback';
import { Overlay } from './pages/overlay/overlay';
import { Admin } from './pages/admin/admin';
import { BingoList } from './pages/bingo-list/bingo-list';
import { BingoArrange } from './pages/bingo-arrange/bingo-arrange';
import { BingoPlay } from './pages/bingo-play/bingo-play';
import { BingoOverlay } from './pages/bingo-overlay/bingo-overlay';
import { ImposterList } from './pages/imposter-list/imposter-list';
import { ImposterGame } from './pages/imposter-game/imposter-game';
import { ImposterOverlay } from './pages/imposter-overlay/imposter-overlay';
import { authGuard } from './guards/auth.guard';
import { adminGuard } from './guards/admin.guard';

export const routes: Routes = [
  {
    path: '',
    component: Shell,
    children: [
      { path: '', component: Start },
      { path: 'vs-chat', component: Home },
      // Alte Adresse, "Meine Bewerbungen" ist jetzt Teil des vs-Chat-Tabs.
      { path: 'meine-bewerbungen', redirectTo: 'vs-chat' },
      { path: 'auth/callback', component: AuthCallback },
      { path: 'profil', component: Profile, canActivate: [authGuard] },
      { path: 'admin', component: Admin, canActivate: [adminGuard] },
      { path: 'bingo', component: BingoList, canActivate: [authGuard] },
      { path: 'bingo/:id/arrange', component: BingoArrange, canActivate: [authGuard] },
      { path: 'bingo/:id/play', component: BingoPlay, canActivate: [authGuard] },
      { path: 'imposter', component: ImposterList, canActivate: [authGuard] },
      { path: 'imposter/:id', component: ImposterGame, canActivate: [authGuard] },
    ],
  },
  // Bewusst kein Shell-Layout (transparenter Hintergrund, keine Kopf-/Fußzeile),
  // deshalb eigene Top-Level-Route statt Kind von Shell.
  { path: 'overlay', component: Overlay },
  { path: 'bingo/:id/overlay', component: BingoOverlay },
  { path: 'imposter/:id/overlay', component: ImposterOverlay },
];
