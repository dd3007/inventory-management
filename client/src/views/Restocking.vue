<template>
  <div class="restocking">
    <div class="page-header">
      <h2>{{ t('restocking.title') }}</h2>
      <p>{{ t('restocking.description') }}</p>
    </div>

    <div v-if="loading" class="loading">{{ t('common.loading') }}</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else>

      <div v-if="orderPlaced" class="success-banner">
        {{ successMessage }}
      </div>

      <div class="card budget-card">
        <div class="budget-header">
          <span class="budget-label">{{ t('restocking.budget') }}</span>
          <span class="budget-value">{{ currencySymbol }}{{ budget.toLocaleString() }}</span>
        </div>
        <input
          type="range"
          min="0"
          max="50000"
          step="500"
          v-model.number="budget"
          class="budget-slider"
        />
        <div class="budget-range-labels">
          <span>{{ currencySymbol }}0</span>
          <span>{{ currencySymbol }}50,000</span>
        </div>
      </div>

      <div class="stats-grid">
        <div class="stat-card info">
          <div class="stat-label">{{ t('restocking.itemsInBudget') }}</div>
          <div class="stat-value">{{ selectedItems.length }}</div>
        </div>
        <div class="stat-card warning">
          <div class="stat-label">{{ t('restocking.totalCost') }}</div>
          <div class="stat-value">{{ currencySymbol }}{{ totalCost.toLocaleString() }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">{{ t('restocking.maxLeadTime') }}</div>
          <div class="stat-value">{{ maxLeadTime }} {{ t('restocking.days') }}</div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3 class="card-title">{{ t('restocking.recommendations') }}</h3>
        </div>
        <div v-if="recommendations.length === 0" class="table-container">
          <p style="padding: 2rem; text-align: center; color: #64748b;">{{ t('restocking.noRecommendations') }}</p>
        </div>
        <div v-else class="table-container">
          <table>
            <thead>
              <tr>
                <th>{{ t('restocking.table.sku') }}</th>
                <th>{{ t('restocking.table.item') }}</th>
                <th>{{ t('restocking.table.category') }}</th>
                <th>{{ t('restocking.table.urgency') }}</th>
                <th>{{ t('restocking.table.currentStock') }}</th>
                <th>{{ t('restocking.table.forecastedDemand') }}</th>
                <th>{{ t('restocking.table.recommendedQty') }}</th>
                <th>{{ t('restocking.table.estimatedCost') }}</th>
                <th>{{ t('restocking.table.leadTime') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="item in recommendations"
                :key="item.item_sku"
                :class="isSelected(item) ? 'row-selected' : 'row-excluded'"
              >
                <td><strong>{{ item.item_sku }}</strong></td>
                <td>{{ translateProductName(item.item_name) }}</td>
                <td>{{ item.category }}</td>
                <td>
                  <span :class="['badge', urgencyBadgeClass(item.urgency)]">
                    {{ t(`restocking.urgency.${item.urgency}`) }}
                  </span>
                </td>
                <td>{{ item.current_quantity }}</td>
                <td>{{ item.forecasted_demand }}</td>
                <td><strong>{{ item.recommended_quantity }}</strong></td>
                <td>{{ currencySymbol }}{{ item.estimated_cost.toLocaleString() }}</td>
                <td>{{ item.lead_time_days }} {{ t('restocking.days') }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="order-action">
        <button
          @click="placeOrder"
          :disabled="selectedItems.length === 0 || submitting || orderPlaced"
          class="btn-place-order"
        >
          {{ orderPlaced ? t('restocking.orderPlaced') : t('restocking.placeOrder') }}
        </button>
      </div>

    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted } from 'vue'
import { api } from '../api'
import { useI18n } from '../composables/useI18n'

export default {
  name: 'Restocking',
  setup() {
    const { t, currentCurrency, translateProductName } = useI18n()

    const budget = ref(25000)
    const recommendations = ref([])
    const loading = ref(true)
    const error = ref(null)
    const submitting = ref(false)
    const orderPlaced = ref(false)
    const successMessage = ref('')

    const currencySymbol = computed(() => currentCurrency.value === 'JPY' ? '¥' : '$')

    // Greedy selection: pick items in priority order until budget is exhausted.
    // The backend guarantees recommendations are sorted critical→high→medium.
    const selectedItems = computed(() => {
      let remaining = budget.value
      return recommendations.value.filter(item => {
        if (item.estimated_cost <= remaining) {
          remaining -= item.estimated_cost
          return true
        }
        return false
      })
    })

    const totalCost = computed(() =>
      selectedItems.value.reduce((s, i) => s + i.estimated_cost, 0)
    )

    const maxLeadTime = computed(() =>
      selectedItems.value.length > 0
        ? Math.max(...selectedItems.value.map(i => i.lead_time_days))
        : 0
    )

    const isSelected = (item) => {
      return selectedItems.value.some(s => s.item_sku === item.item_sku)
    }

    const urgencyBadgeClass = (urgency) => {
      const map = { critical: 'danger', high: 'warning', medium: 'info' }
      return map[urgency] || ''
    }

    const loadRecommendations = async () => {
      loading.value = true
      error.value = null
      try {
        recommendations.value = await api.getRestockingRecommendations()
      } catch (err) {
        error.value = 'Failed to load restocking recommendations: ' + err.message
        console.error(err)
      } finally {
        loading.value = false
      }
    }

    const placeOrder = async () => {
      submitting.value = true
      try {
        const items = selectedItems.value.map(i => ({
          sku: i.item_sku,
          name: i.item_name,
          quantity: i.recommended_quantity,
          unit_cost: i.unit_cost
        }))
        await api.submitRestockingOrder({ items, total_cost: totalCost.value })
        orderPlaced.value = true
        successMessage.value = t('restocking.successMessage')
      } catch (err) {
        error.value = 'Failed to place order: ' + err.message
      } finally {
        submitting.value = false
      }
    }

    onMounted(loadRecommendations)

    return {
      t,
      translateProductName,
      budget,
      recommendations,
      loading,
      error,
      submitting,
      orderPlaced,
      successMessage,
      currencySymbol,
      selectedItems,
      totalCost,
      maxLeadTime,
      isSelected,
      urgencyBadgeClass,
      placeOrder
    }
  }
}
</script>

<style scoped>
.budget-card {
  padding: 1.5rem;
}

.budget-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.budget-label {
  font-weight: 600;
  color: #475569;
  font-size: 0.875rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.budget-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: #0f172a;
}

.budget-slider {
  width: 100%;
  accent-color: #2563eb;
  height: 6px;
  cursor: pointer;
}

.budget-range-labels {
  display: flex;
  justify-content: space-between;
  margin-top: 0.5rem;
  font-size: 0.813rem;
  color: #94a3b8;
}

.row-selected {
  /* inherits default table row styling */
}

.row-excluded {
  opacity: 0.4;
}

.order-action {
  display: flex;
  justify-content: flex-end;
  margin-top: 1.5rem;
}

.btn-place-order {
  background: #2563eb;
  color: white;
  border: none;
  border-radius: 8px;
  padding: 0.75rem 2rem;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-place-order:hover:not(:disabled) {
  background: #1d4ed8;
}

.btn-place-order:disabled {
  background: #94a3b8;
  cursor: not-allowed;
}

.success-banner {
  background: #d1fae5;
  border: 1px solid #6ee7b7;
  color: #065f46;
  padding: 0.875rem 1.25rem;
  border-radius: 8px;
  margin-bottom: 1.25rem;
  font-weight: 500;
}
</style>
