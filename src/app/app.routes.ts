import { Routes } from '@angular/router';
import { Shell } from './shell/shell';
import { Home } from './pages/home/home';
import { MyApplications } from './pages/my-applications/my-applications';
import { AuthCallback } from './pages/auth-callback/auth-callback';
import { Overlay } from './pages/overlay/overlay';
import { Admin } from './pages/admin/admin';
import { BingoList } from './pages/bingo-list/bingo-list';
import { BingoArrange } from './pages/bingo-arrange/bingo-arrange';
import { BingoPlay } from './pages/bingo-play/bingo-play';
import { BingoOverlay } from './pages/bingo-overlay/bingo-overlay';
import { authGuard } from './guards/auth.guard';
import { adminGuard } from './guards/admin.guard';

export const routes: Routes = [
  {
    path: '',
    component: Shell,
    children: [
      { path: '', component: Home },
      { path: 'meine-bewerbungen', component: MyApplications, canActivate: [authGuard] },
      { path: 'auth/callback', component: AuthCallback },
      { path: 'admin', component: Admin, canActivate: [adminGuard] },
      { path: 'bingo', component: BingoList, canActivate: [authGuard] },
      { path: 'bingo/:id/arrange', component: BingoArrange, canActivate: [adminGuard] },
      { path: 'bingo/:id/play', component: BingoPlay, canActivate: [authGuard] },
    ],
  },
  // Bewusst kein Shell-Layout (transparenter Hintergrund, keine Kopf-/Fußzeile),
  // deshalb eigene Top-Level-Route statt Kind von Shell.
  { path: 'overlay', component: Overlay },
  { path: 'bingo/:id/overlay', component: BingoOverlay },
];
