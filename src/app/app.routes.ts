import { Routes } from '@angular/router';
import { Shell } from './shell/shell';
import { Home } from './pages/home/home';
import { CategoryDetail } from './pages/category-detail/category-detail';
import { MyApplications } from './pages/my-applications/my-applications';
import { AuthCallback } from './pages/auth-callback/auth-callback';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    component: Shell,
    children: [
      { path: '', component: Home },
      { path: 'kategorie/:slug', component: CategoryDetail },
      { path: 'meine-bewerbungen', component: MyApplications, canActivate: [authGuard] },
      { path: 'auth/callback', component: AuthCallback },
    ],
  },
  // /admin und /overlay kommen später. /overlay bekommt bewusst kein Shell-Layout
  // (transparenter Hintergrund, keine Kopf-/Fußzeile), deshalb als eigene Top-Level-Route.
];
