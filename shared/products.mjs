export const products = [
  { id: 'exchange', image: '/images/cway-dispenser.jpg', imageAlt: 'CWAY dispenser water bottle', name: 'Dispenser exchange', brand: 'Sabi Water', detail: 'One full bottle · exchange required', price: 1700, category: 'Dispenser', color: '#087cbd', size: 'REFILL' },
  { id: 'cway', image: '/images/cway-table-water.jpg', imageAlt: 'Pack of CWAY bottled water', name: 'CWAY table water', brand: 'CWAY', detail: '75cl · pack of 12', price: 2200, category: 'Table water', color: '#1772b5', size: '75cl' },
  { id: 'nestle', image: '/images/nestle-pure-life.png', imageAlt: 'Nestlé Pure Life 60cl water pack and bottle', name: 'Nestlé Pure Life', brand: 'Pure Life', detail: '60cl · pack of 20', price: 4850, category: 'Table water', color: '#ce4080', size: '60cl' },
  { id: 'swan', image: '/images/swan-water.jpg', imageAlt: 'Swan natural spring water 50cl bottles', name: 'Swan table water', brand: 'SWAN', detail: '50cl · pack of 12', price: 2100, category: 'Table water', color: '#369680', size: '50cl' },
  { id: 'aquafina', image: '/images/aquafina-water.jpg', imageAlt: 'Aquafina 50cl bottled water pack', name: 'Aquafina table water', brand: 'Aquafina', detail: '50cl · pack of 12', price: 1650, category: 'Table water', color: '#155ca5', size: '50cl' },
  { id: 'lasena', image: '/images/lasena-water.jpg', imageAlt: 'Lasena natural alkaline water 50cl bottles', name: 'Lasena natural alkaline water', brand: 'Lasena', detail: '50cl · pack of 20', price: 7500, category: 'Table water', color: '#2969ad', size: '50cl' },
]
export const money = value => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(value)
