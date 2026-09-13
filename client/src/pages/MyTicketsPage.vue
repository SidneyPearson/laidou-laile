<script setup lang="ts">
import { computed, ref } from 'vue'
import { cityKeyResolver } from '../utils/cityIdentity'
import { personaLabel } from '../utils/personaLabels'
import { useRouter } from 'vue-router'
import { useTickets, type TicketRecord } from '../composables/useTickets'
import CityTicketSheet from '../components/today/CityTicketSheet.vue'
import type { TodaySpot } from '../types/todayPlan'

/**
 * 我的城市票根：按城市分目录，每个城市下列出全部历史票根；
 * 点开某张票根会弹出与「今日计划」一致的完整票根（路线图 + 扇形地点卡，
 * 可保存图片/分享）。票根在生成当日落库，同城同日只保留最新一张。
 */

const router = useRouter()
const { tickets } = useTickets()

const selectedTicket = ref<TicketRecord | null>(null)

const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  weekday: 'short',
})

function formatDate(ticket: TicketRecord): string {
  const date = new Date(`${ticket.date}T12:00:00`)
  if (Number.isNaN(date.getTime())) return ticket.date
  return dateFormatter.format(date)
}

interface CityGroup {
  key: string
  cityName: string
  tickets: TicketRecord[]
}

/** 城市目录：票根按最新生成时间排序，城市分组顺序取该城市最新票根的位置。 */
const cityGroups = computed<CityGroup[]>(() => {
  const groups = new Map<string, CityGroup>()
  const keyFor = cityKeyResolver(tickets.value)
  for (const ticket of tickets.value) {
    const key = keyFor(ticket)
    let group = groups.get(key)
    if (!group) {
      group = { key, cityName: ticket.cityName, tickets: [] }
      groups.set(key, group)
    }
    group.tickets.push(ticket)
  }
  return [...groups.values()]
})

const ticketCount = computed(() => tickets.value.length)

/** 弹层需要 TodaySpot 形状；历史快照只提供票根渲染用到的字段。 */
const sheetSpots = computed<TodaySpot[]>(() =>
  (selectedTicket.value?.spots ?? []).map(spot => ({
    id: spot.id,
    name: spot.name,
    lng: spot.lng,
    lat: spot.lat,
    coverImageUrl: spot.coverImageUrl,
    coverImageFallbackUrl: spot.coverImageFallbackUrl,
  })) as unknown as TodaySpot[],
)

function openTicket(ticket: TicketRecord) {
  if (ticket.invalidated) return
  selectedTicket.value = ticket
}

function closeTicket() {
  selectedTicket.value = null
}

function onTicketSaved() {
  // 历史票根保存/分享成功后回到目录页
  selectedTicket.value = null
}

function goBack() {
  router.back()
}
</script>

<template>
  <main class="tickets-page">
    <header class="tickets-header">
      <button type="button" class="back-btn" aria-label="返回" @click="goBack">‹</button>
      <div class="tickets-title">
        <p>CITY TICKETS</p>
        <h1>我的城市票根</h1>
      </div>
      <span class="count-pill">{{ ticketCount }} 张</span>
    </header>

    <section v-if="cityGroups.length" class="city-directory">
      <div v-for="group in cityGroups" :key="group.key" class="city-group">
        <div class="city-group-head">
          <span class="city-group-name"><i aria-hidden="true">📍</i>{{ group.cityName }}</span>
          <span class="city-group-count">{{ group.tickets.length }} 张票根</span>
        </div>
        <div class="ticket-rows">
          <button
            v-for="ticket in group.tickets"
            :key="ticket.id"
            type="button"
            class="ticket-row"
            :disabled="ticket.invalidated"
            @click="openTicket(ticket)"
          >
            <span class="ticket-row-stub" aria-hidden="true">🎫</span>
            <span class="ticket-row-copy">
              <b>{{ formatDate(ticket) }}</b>
              <small>
                <template v-if="ticket.invalidated">行程已更正，完成后可重新生成</template>
                <template v-else>{{ ticket.spots.length }} 站</template><template v-if="ticket.persona"> · {{ personaLabel(ticket.persona) }}</template>
              </small>
            </span>
            <em aria-hidden="true">›</em>
          </button>
        </div>
      </div>

      <button type="button" class="map-link" @click="router.replace({ name: 'visited-cities' })">
        查看足迹点亮地图 <em>→</em>
      </button>
    </section>

    <section v-else class="ticket-empty">
      <span aria-hidden="true">🎫</span>
      <h2>还没有城市票根</h2>
      <p>在「今日计划」里走完当天的地点，<br>生成城市票根后，它会出现在这里，<br>行程完成时，足迹就已自动点亮。</p>
      <button type="button" @click="router.replace({ name: 'today-plan' })">去今日计划看看</button>
    </section>

    <Transition name="sheet">
      <CityTicketSheet
        v-if="selectedTicket"
        :city="selectedTicket.cityName"
        :persona="selectedTicket.persona || '城市漫游'"
        :spots="sheetSpots"
        :duration="selectedTicket.duration || '半天'"
        :date="selectedTicket.date"
        @close="closeTicket"
        @saved="onTicketSaved"
      />
    </Transition>
  </main>
</template>

<style scoped>
.tickets-page {
  --accent: #c7ff1f;
  width: 100%;
  max-width: 480px;
  min-height: 100dvh;
  margin: 0 auto;
  padding: 0 16px calc(112px + env(safe-area-inset-bottom));
  background: radial-gradient(circle at 8% 0, rgba(56, 189, 248, 0.12), transparent 26%),
    radial-gradient(circle at 95% 14%, rgba(199, 255, 31, 0.09), transparent 24%),
    #02070e;
  color: #fff;
}

.tickets-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: max(16px, env(safe-area-inset-top)) 2px 14px;
}
.back-btn {
  flex: none;
  width: 40px;
  height: 40px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 50%;
  background: rgba(8, 13, 20, 0.85);
  color: #fff;
  font-size: 24px;
  line-height: 1;
}
.back-btn:active { transform: scale(0.94); }
.tickets-title { min-width: 0; flex: 1; }
.tickets-title p {
  color: var(--accent);
  font-size: 10px;
  font-weight: 850;
  letter-spacing: 0.17em;
}
.tickets-title h1 { margin-top: 4px; font-size: 20px; font-weight: 920; }
.count-pill {
  flex: none;
  padding: 7px 12px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.85);
  font-size: 12px;
  font-weight: 800;
}

.city-directory {
  display: grid;
  gap: 18px;
  padding-top: 4px;
}
.city-group-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  padding: 0 2px 9px;
}
.city-group-name {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 16px;
  font-weight: 920;
}
.city-group-name i { font-style: normal; }
.city-group-count {
  color: rgba(255, 255, 255, 0.42);
  font-size: 11.5px;
  font-weight: 700;
}
.ticket-rows {
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 20px;
  background: rgba(14, 20, 30, 0.86);
}
.ticket-row {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 12px;
  padding: 14px 15px;
  border: 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  background: transparent;
  text-align: left;
  color: #fff;
}
.ticket-row:last-child { border-bottom: 0; }
.ticket-row:active { background: rgba(255, 255, 255, 0.05); }
.ticket-row-stub {
  display: grid;
  width: 40px;
  height: 40px;
  flex: none;
  place-items: center;
  border-radius: 13px;
  background: rgba(199, 255, 31, 0.1);
  font-size: 19px;
  font-style: normal;
}
.ticket-row-copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 3px;
}
.ticket-row-copy b { font-size: 14.5px; font-weight: 850; }
.ticket-row-copy small { color: rgba(255, 255, 255, 0.5); font-size: 12px; }
.ticket-row em {
  flex: none;
  color: rgba(255, 255, 255, 0.35);
  font-size: 20px;
  font-style: normal;
}

.map-link {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 14px;
  border: 1px solid rgba(199, 255, 31, 0.25);
  border-radius: 16px;
  background: rgba(199, 255, 31, 0.07);
  color: #eaf7d0;
  font-size: 14px;
  font-weight: 850;
}
.map-link em { font-style: normal; color: var(--accent); }
.map-link:active { transform: scale(0.98); }

.ticket-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 36px;
  padding: 36px 24px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 26px;
  background: rgba(14, 20, 30, 0.7);
  text-align: center;
}
.ticket-empty span { font-size: 44px; }
.ticket-empty h2 { margin-top: 14px; font-size: 19px; font-weight: 920; }
.ticket-empty p {
  margin: 10px 0 0;
  color: rgba(255, 255, 255, 0.55);
  font-size: 13px;
  line-height: 1.8;
}
.ticket-empty button {
  margin-top: 20px;
  padding: 12px 26px;
  border: 0;
  border-radius: 999px;
  background: var(--accent);
  color: #101508;
  font-size: 14px;
  font-weight: 850;
}
.ticket-empty button:active { transform: scale(0.97); }

.sheet-enter-active,
.sheet-leave-active { transition: opacity 0.2s ease; }
.sheet-enter-from,
.sheet-leave-to { opacity: 0; }
</style>
