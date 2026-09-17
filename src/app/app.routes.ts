import { Routes } from '@angular/router';
import { Shell } from './shell/shell';
import { Home } from './pages/home/home';
import { CategoryDetail } from './pages/category-detail/category-detail';
import { MyApplications } from './pages/my-applications/my-applications';
import { AuthCallback } from './pages/auth-callback/auth-callback';
import { Overlay } from './pages/overlay/overlay';
import { Admin } from './pages/admin/admin';
import { authGuard } from './guards/auth.guard';
import { adminGuard } from './guards/admin.guard';

export const routes: Routes = [
  {
    path: '',
    component: Shell,
    children: [
      { path: '', component: Home },
      { path: 'kategorie/:slug', component: CategoryDetail },
      { path: 'meine-bewerbungen', component: MyApplications, canActivate: [authGuard] },
      { path: 'auth/callback', component: AuthCallback },
      { path: 'admin', component: Admin, canActivate: [adminGuard] },
    ],
  },
  // Bewusst kein Shell-Layout (transparenter Hintergrund, keine Kopf-/Fußzeile),
  // deshalb eigene Top-Level-Route statt Kind von Shell.
  { path: 'overlay', component: Overlay },
];
