import { createRouter, createWebHashHistory } from 'vue-router'
import HomePage from '../pages/HomePage.vue'
import RoutePage from '../pages/RoutePage.vue'
import HistoryPage from '../pages/HistoryPage.vue'
import { useAdminAuth } from '../admin/auth'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'home', component: HomePage },
    { path: '/routes', name: 'routes', component: RoutePage },
    { path: '/history', name: 'history', component: HistoryPage },
    { path: '/city', name: 'city', component: () => import('../pages/CityExplorePage.vue') },
    { path: '/today', name: 'today-plan', component: () => import('../pages/TodayPlanPage.vue') },
    { path: '/admin/login', name: 'admin-login', component: () => import('../pages/admin/AdminLoginPage.vue') },
    {
      path: '/admin', component: () => import('../layouts/AdminLayout.vue'), meta: { requiresAdmin: true },
      children: [
        { path: '', name: 'admin-dashboard', component: () => import('../pages/admin/AdminDashboardPage.vue') },
        { path: 'cities', name: 'admin-cities', component: () => import('../pages/admin/AdminCitiesPage.vue') },
        { path: 'cities/:adcode/refresh', name: 'admin-city-refresh-start', component: () => import('../pages/admin/AdminCityRefreshPage.vue') },
        { path: 'refresh-runs/:runId', name: 'admin-city-refresh', component: () => import('../pages/admin/AdminCityRefreshPage.vue') },
        { path: 'spots', name: 'admin-spots', component: () => import('../pages/admin/AdminSpotsPage.vue') },
        { path: 'spots/new', name: 'admin-spot-new', component: () => import('../pages/admin/AdminSpotEditPage.vue') },
        { path: 'spots/:id', name: 'admin-spot-edit', component: () => import('../pages/admin/AdminSpotEditPage.vue') },
      ],
    },
  ],
})

router.beforeEach(async to => {
  if (!to.meta.requiresAdmin) return true
  const auth = useAdminAuth()
  if (!auth.checked.value && !await auth.check()) return { name: 'admin-login', query: { redirect: to.fullPath } }
  if (!auth.authenticated.value) return { name: 'admin-login', query: { redirect: to.fullPath } }
  return true
})
