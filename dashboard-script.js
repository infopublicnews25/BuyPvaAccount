// Dashboard JavaScript
let currentPath = '/';
let fileTree = {};
let selectedFile = null;

function getApiBase() {
    // Robust fallback: many dashboard actions rely on CONFIG.API,
    // but some deployments may omit config.js from dashboard.html.
    const raw = (window.CONFIG && typeof window.CONFIG.API === 'string') ? window.CONFIG.API : '';
    const base = String(raw || '').trim();
    return (base ? base : '/api').replace(/\/+$/, '');
}

// Helper function to get auth headers
function getAuthHeaders() {
    const token = localStorage.getItem('admin_auth_token');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
}

async function getStaffContext() {
    try {
        const res = await fetch(`${getApiBase()}/staff/me`, { headers: { ...getAuthHeaders() } });
        const data = await res.json();
        if (data && data.success && data.user) return data.user;
    } catch (e) {}
    return null;
}

function applyEditorRestrictions(staff) {
    const role = String(staff?.role || '').toLowerCase();
    if (role !== 'editor') return;

    const rawPermissions = Array.isArray(staff?.permissions) ? staff.permissions : [];
    const normalizedPermissions = new Set(
        rawPermissions
            .map(p => String(p || '').toLowerCase())
            .map(p => p.replace(/[^a-z0-9]/g, ''))
            .filter(Boolean)
    );

    const hasPerm = (key) => {
        const k = String(key || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!k) return false;
        if (normalizedPermissions.has(k)) return true;

        // Accept common UI-label variants (in case permissions were stored as labels)
        if (k === 'blog') {
            return normalizedPermissions.has('blogadmin') || normalizedPermissions.has('createpost') || normalizedPermissions.has('posts');
        }
        if (k === 'media') {
            return normalizedPermissions.has('medialibrary') || normalizedPermissions.has('mediafiles');
        }
        if (k === 'products') {
            return normalizedPermissions.has('addproduct') || normalizedPermissions.has('product');
        }
        if (k === 'categories') {
            return normalizedPermissions.has('productcategories') || normalizedPermissions.has('category') || normalizedPermissions.has('categories');
        }

        if (k === 'send') {
            return normalizedPermissions.has('sendnotification') || normalizedPermissions.has('senddelivery') || normalizedPermissions.has('delivery') || normalizedPermissions.has('notification');
        }
        if (k === 'note') {
            return normalizedPermissions.has('notes') || normalizedPermissions.has('createnote');
        }
        if (k === 'comment') {
            return normalizedPermissions.has('comments') || normalizedPermissions.has('createcomment');
        }
        if (k === 'inventory') {
            return normalizedPermissions.has('stock') || normalizedPermissions.has('productstock');
        }
        if (k === 'analytics') {
            return normalizedPermissions.has('productanalytics') || normalizedPermissions.has('analytics');
        }
        if (k === 'reviews') {
            return normalizedPermissions.has('productreviews') || normalizedPermissions.has('reviews');
        }
        if (k === 'files') {
            return normalizedPermissions.has('filemanager') || normalizedPermissions.has('files') || normalizedPermissions.has('pages') || normalizedPermissions.has('websitepages');
        }
        return false;
    };

    const canFiles = hasPerm('files');
    const canSend = hasPerm('send');

    // Editor should not see the dashboard sidebar; keep the UI focused.
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) sidebar.style.display = canFiles ? '' : 'none';
    const menuToggle = document.querySelector('.menu-toggle');
    if (menuToggle) menuToggle.style.display = canFiles ? '' : 'none';

    // When sidebar is removed, also remove the left offset on main content.
    // Otherwise the whole dashboard can shift off-screen and appear blank.
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
        // If sidebar is hidden, remove left offset so content doesn't shift off-screen.
        // If sidebar is allowed, let the stylesheet handle layout.
        mainContent.style.marginLeft = canFiles ? '' : '0';
    }

    // Sections toggled by editor permissions
    const pagesOverview = document.querySelector('.pages-overview');
    if (pagesOverview) pagesOverview.style.display = canFiles ? '' : 'none';

    const sendReminderSection = document.querySelector('.send-reminder-section');
    if (sendReminderSection) sendReminderSection.style.display = canSend ? '' : 'none';

    const sidebarMenuSections = document.querySelectorAll('.sidebar .menu-section');
    const pagesMenuSection = sidebarMenuSections?.[0];
    const fileManagerSection = sidebarMenuSections?.[1];
    if (pagesMenuSection) pagesMenuSection.style.display = canFiles ? '' : 'none';
    if (fileManagerSection) fileManagerSection.style.display = canFiles ? '' : 'none';

    // Hide sidebar quick actions that expose admin panel
    document.querySelectorAll('a[href="admin.html"]').forEach(a => {
        if (a && a.closest('.sidebar')) a.style.display = 'none';
    });

    // Hide header buttons to admin-only areas
    document.querySelectorAll('.header-actions .admin-btn, .header-actions .orders-btn, .header-actions .notifications-btn').forEach(btn => {
        if (btn) btn.style.display = 'none';
    });

    // Widgets section: show exactly the allowed tools without adding new cards.
    // Reuse existing cards by re-labeling them for editor role.
    const configureWidgetCard = (card, { title, description, iconClass, color, href }) => {
        const h4 = card.querySelector('h4');
        const p = card.querySelector('p');
        if (h4) h4.textContent = title;
        if (p) p.textContent = description;

        const iconWrap = card.querySelector('.page-icon');
        if (iconWrap && color) iconWrap.style.color = color;
        const icon = card.querySelector('.page-icon i');
        if (icon && iconClass) icon.className = iconClass;

        const actions = card.querySelector('.page-actions');
        if (actions) {
            actions.innerHTML = `
                <button onclick="window.location.href='${href}'; event.stopPropagation();" class="view-btn" title="Open">
                    <i class="fas fa-external-link-alt"></i> Open
                </button>
            `;
        }

        card.onclick = () => { window.location.href = href; };
    };

    // Hide all widget cards first
    document.querySelectorAll('.widgets-grid .page-card').forEach(card => {
        card.style.display = 'none';
    });

    // Prefer stable selectors, but fall back to title-based detection if the browser cached an older dashboard.html
    let createPostCard = document.querySelector('.widgets-grid .page-card[data-editor-tool="create-post"]');
    let blogAdminCard = document.querySelector('.widgets-grid .page-card[data-editor-tool="blog-admin"]');
    let mediaLibraryCard = document.querySelector('.widgets-grid .page-card[data-editor-tool="media-library"]');

    if (!createPostCard || !blogAdminCard || !mediaLibraryCard) {
        const widgetCards = Array.from(document.querySelectorAll('.widgets-grid .page-card'));
        for (const card of widgetCards) {
            const t = (card.querySelector('h4')?.textContent || '').trim().toLowerCase();
            if (!createPostCard && t === 'create post') createPostCard = card;
            // Old placeholder cards we repurpose
            if (!blogAdminCard && t.includes('create product review')) blogAdminCard = card;
            if (!mediaLibraryCard && t.includes('reminder')) mediaLibraryCard = card;
        }
    }

    if (createPostCard && hasPerm('blog')) {
        configureWidgetCard(createPostCard, {
            title: 'Create post',
            description: 'Create Post',
            iconClass: 'fas fa-plus-circle',
            color: '#f39c12',
            href: 'create-post.html'
        });
        createPostCard.style.display = '';
    }

    if (blogAdminCard && hasPerm('blog')) {
        configureWidgetCard(blogAdminCard, {
            title: 'Blog admin',
            description: 'Manage blog posts',
            iconClass: 'fas fa-blog',
            color: '#2b6cb0',
            href: 'blog-admin.html'
        });
        blogAdminCard.style.display = '';
    }

    if (mediaLibraryCard && hasPerm('media')) {
        configureWidgetCard(mediaLibraryCard, {
            title: 'Media library',
            description: 'Upload and manage files',
            iconClass: 'fas fa-photo-video',
            color: '#38a169',
            href: 'media-library.html'
        });
        mediaLibraryCard.style.display = '';
    }

    // Additional widgets (existing cards) toggled by permissions
    const noteCard = document.querySelector('.widgets-grid .page-card[data-editor-tool="note"]');
    if (noteCard) noteCard.style.display = hasPerm('note') ? '' : 'none';

    const commentCard = document.querySelector('.widgets-grid .page-card[data-editor-tool="comment"]');
    if (commentCard) commentCard.style.display = hasPerm('comment') ? '' : 'none';

    const sendNotificationCard = document.querySelector('.send-cards-grid .page-card[data-editor-tool="send-notification"]');
    if (sendNotificationCard) sendNotificationCard.style.display = canSend ? '' : 'none';
    const sendDeliveryCard = document.querySelector('.send-cards-grid .page-card[data-editor-tool="send-delivery"]');
    if (sendDeliveryCard) sendDeliveryCard.style.display = canSend ? '' : 'none';

    // Products section cards: keep only the permitted ones (stable selectors)
    document.querySelectorAll('.products-grid .page-card').forEach(card => {
        const key = String(card.getAttribute('data-editor-tool') || '').trim();
        let keep = false;
        if (key === 'add-product') keep = hasPerm('products');
        else if (key === 'bulk-add-products') keep = hasPerm('products');
        else if (key === 'product-categories') keep = hasPerm('categories');
        else if (key === 'inventory') keep = hasPerm('inventory');
        else if (key === 'product-analytics') keep = hasPerm('analytics');
        else if (key === 'product-reviews') keep = hasPerm('reviews');
        else {
            // Fallback for unexpected markup
            const title = (card.querySelector('h4')?.textContent || '').trim().toLowerCase();
            if (title.includes('add product')) keep = hasPerm('products');
            else if (title.includes('bulk add')) keep = hasPerm('products');
            else if (title.includes('product categories')) keep = hasPerm('categories');
            else if (title === 'inventory') keep = hasPerm('inventory');
            else if (title.includes('analytics')) keep = hasPerm('analytics');
            else if (title.includes('reviews')) keep = hasPerm('reviews');
        }
        card.style.display = keep ? '' : 'none';
    });

    // Never hide whole sections for editor (prevents "blank" page reports).
    // If no cards are visible, show a message using the existing section header text.
    const widgetsSection = document.querySelector('.widgets-section');
    const productsSection = document.querySelector('.products-section');
    if (widgetsSection) widgetsSection.style.display = '';
    if (productsSection) productsSection.style.display = '';

    const anyWidgetVisible = Array.from(document.querySelectorAll('.widgets-grid .page-card')).some(c => c.style.display !== 'none');
    const anyProductVisible = Array.from(document.querySelectorAll('.products-grid .page-card')).some(c => c.style.display !== 'none');
    if (!anyWidgetVisible && !anyProductVisible) {
        const p = widgetsSection?.querySelector('.section-header p');
        if (p) {
            p.textContent = 'No access has been assigned to this editor. Please contact admin.';
        }
    }
}

// Initialize products in localStorage
async function initializeProducts() {
    const existingProducts = localStorage.getItem('admin_products_v1');
    // Always prefer API as the source of truth (prevents stale localStorage re-adding deleted products)
    console.log('Initializing products...');
    try {
        // Try to load from API first
            const response = await fetch(`${getApiBase()}/products`);
        const data = await response.json();
        if (data.success && Array.isArray(data.products) && data.products.length > 0) {
            localStorage.setItem('admin_products_v1', JSON.stringify(data.products));
            console.log(`✅ Loaded ${data.products.length} products from API`);
            return;
        }
    } catch (error) {
        console.warn('API not available, trying to load from local products.json');
    }

    // If API is unavailable, keep existing localStorage if present
    try {
        if (existingProducts && Array.isArray(JSON.parse(existingProducts)) && JSON.parse(existingProducts).length > 0) {
            console.log('Keeping existing products from localStorage:', JSON.parse(existingProducts).length);
            return;
        }
    } catch (e) {}

    // Fallback: load from local products.json file
    try {
        const response = await fetch('./backend/products.json');
        const products = await response.json();
        if (Array.isArray(products) && products.length > 0) {
            localStorage.setItem('admin_products_v1', JSON.stringify(products));
            console.log(`✅ Loaded ${products.length} products from local file`);
        }
    } catch (error) {
        console.error('Failed to load products:', error);
        // Create sample products as last resort
        const sampleProducts = [
            {
                id: "1",
                title: "Gmail Account",
                price: 0.25,
                quantity: 100,
                category: "Gmail",
                image: "",
                note: "Good quality Gmail accounts"
            },
            {
                id: "2", 
                title: "Yahoo Account",
                price: 0.2,
                quantity: 80,
                category: "Gmail",
                image: "",
                note: "Fresh Yahoo accounts"
            }
        ];
        localStorage.setItem('admin_products_v1', JSON.stringify(sampleProducts));
        console.log('✅ Created sample products');
    }
}

// Initialize dashboard
document.addEventListener('DOMContentLoaded', function() {
    // Check if user is authenticated
    // const token = localStorage.getItem('admin_auth_token');
    // if (!token) {
    //     showNotification('Please login as admin first', 'error');
    //     setTimeout(() => {
    //         window.location.href = 'admin.html';
    //     }, 2000);
    //     return;
    // }

    (async () => {
        const staff = await getStaffContext();
        if (!staff) {
            // Invalid or expired token
            localStorage.removeItem('admin_auth_token');
            localStorage.removeItem('adminLoggedIn');
            localStorage.removeItem('adminToken');
            localStorage.removeItem('admin_user');
            window.location.href = 'admin.html';
            return;
        }

        // Expose context for debugging
        window.__staffContext = staff;

        applyEditorRestrictions(staff);

        const role = String(staff?.role || '').toLowerCase();
        if (role === 'editor') {
            // Allow optional sections based on granted permissions.
            const rawPermissions = Array.isArray(staff?.permissions) ? staff.permissions : [];
            const normalized = new Set(rawPermissions.map(p => String(p || '').toLowerCase()).map(p => p.replace(/[^a-z0-9]/g, '')).filter(Boolean));
            const canFiles = normalized.has('files') || normalized.has('filemanager') || normalized.has('pages') || normalized.has('websitepages');
            const canProducts = normalized.has('products') || normalized.has('product') || normalized.has('addproduct');
            const canCategories = normalized.has('categories') || normalized.has('category') || normalized.has('productcategories');
            const canInventory = normalized.has('inventory') || normalized.has('stock') || normalized.has('productstock');

            if (canProducts || canCategories || canInventory) {
                try { initializeProducts(); } catch (e) {}
            }

            if (canFiles) {
                loadFileTree();
                loadWebsitePages();
                loadFiles(currentPath);
                setupEventListeners();
                handleUrlParameters();
            }

            // Note: notifications/reminders are local-only right now; keep disabled unless admin wants more later.
            return;
        }

        initializeProducts();
        loadFileTree();
        loadWebsitePages();
        loadFiles(currentPath);
        loadReminders();
        loadNotifications();
        setupEventListeners();
        handleUrlParameters();

        // Check for product updates every 10 seconds
        setInterval(checkForProductUpdates, 10 * 1000);
    })();
});

// Setup event listeners
function setupEventListeners() {
    const role = String(window.__staffContext?.role || '').toLowerCase();

    // Search functionality
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                searchFiles();
            }
        });
    }

    // File content changes
    const fileContent = document.getElementById('file-content');
    if (fileContent) fileContent.addEventListener('input', function() {
        // Mark file as modified
        const saveBtn = document.querySelector('.save-btn');
        if (saveBtn) {
            saveBtn.innerHTML = '<i class="fas fa-save"></i> Save*';
            saveBtn.style.backgroundColor = '#f39c12';
        }
    });

    // Keep editor UX stable: don't enable draggable layout editing.
    if (role !== 'editor') {
        // Initialize drag and drop
        initializeDragAndDrop();
        
        // Initialize long press to move
        initializeLongPressMove();
    }
}

// Initialize drag and drop functionality
function initializeDragAndDrop() {
    const dashboardContainer = document.querySelector('.content-area');
    const sections = document.querySelectorAll('.content-area > div');

    sections.forEach(section => {
        if (section.id !== 'file-editor') { // Don't make file editor draggable
            section.draggable = true;
            section.addEventListener('dragstart', handleDragStart);
            section.addEventListener('dragend', handleDragEnd);
            
            // Add drag handle
            const header = section.querySelector('.section-header');
            if (header) {
                const dragHandle = document.createElement('div');
                dragHandle.className = 'drag-handle';
                dragHandle.innerHTML = '<i class="fas fa-grip-vertical"></i>';
                dragHandle.style.cssText = 'cursor: grab; margin-right: 10px; color: #666;';
                header.insertBefore(dragHandle, header.firstChild);
            }
        }
    });

    // Make page-cards draggable
    const pageCards = document.querySelectorAll('.page-card');
    pageCards.forEach(card => {
        card.draggable = true;
        card.addEventListener('dragstart', handleCardDragStart);
        card.addEventListener('dragend', handleCardDragEnd);
        
        // Add drag handle to page cards
        if (!card.querySelector('.card-drag-handle')) {
            const dragHandle = document.createElement('div');
            dragHandle.className = 'card-drag-handle';
            dragHandle.innerHTML = '<i class="fas fa-arrows-alt"></i>';
            dragHandle.title = 'Drag to reorder';
            dragHandle.style.cssText = 'position: absolute; top: 8px; right: 8px; cursor: grab; color: #666; font-size: 14px; opacity: 0.8; z-index: 100; background: rgba(255,255,255,0.9); padding: 2px; border-radius: 3px;';
            card.style.position = 'relative';
            card.appendChild(dragHandle);
            
            // Make drag handle initiate drag
            dragHandle.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                card.draggable = true;
            });
        }
    });

    // Make dashboard container a drop zone
    dashboardContainer.addEventListener('dragover', handleDragOver);
    dashboardContainer.addEventListener('drop', handleDrop);

    // Make widgets grid a drop zone for cards
    const widgetsGrid = document.querySelector('.widgets-grid');
    if (widgetsGrid) {
        widgetsGrid.addEventListener('dragover', handleCardDragOver);
        widgetsGrid.addEventListener('drop', handleCardDrop);
        
        // Add drop indicators for cards
        const cards = widgetsGrid.querySelectorAll('.page-card');
        cards.forEach(card => {
            if (!card.previousElementSibling || !card.previousElementSibling.classList.contains('card-drop-indicator')) {
                const dropIndicator = document.createElement('div');
                dropIndicator.className = 'card-drop-indicator';
                dropIndicator.style.cssText = 'display: none; width: 4px; height: 100%; background: #3498db; position: absolute; left: -2px; top: 0; border-radius: 2px; z-index: 50;';
                card.style.position = 'relative';
                widgetsGrid.insertBefore(dropIndicator, card);
            }
        });
    }

    // Make send cards grid a drop zone for cards
    const sendCardsGrid = document.querySelector('.send-cards-grid');
    if (sendCardsGrid) {
        sendCardsGrid.addEventListener('dragover', handleCardDragOver);
        sendCardsGrid.addEventListener('drop', handleCardDrop);
        
        // Add drop indicators for send cards
        const cards = sendCardsGrid.querySelectorAll('.page-card');
        cards.forEach(card => {
            if (!card.previousElementSibling || !card.previousElementSibling.classList.contains('card-drop-indicator')) {
                const dropIndicator = document.createElement('div');
                dropIndicator.className = 'card-drop-indicator';
                dropIndicator.style.cssText = 'display: none; width: 4px; height: 100%; background: #3498db; position: absolute; left: -2px; top: 0; border-radius: 2px; z-index: 50;';
                card.style.position = 'relative';
                sendCardsGrid.insertBefore(dropIndicator, card);
            }
        });
    }

    // Make products grid a drop zone for cards
    const productsGrid = document.querySelector('.products-grid');
    if (productsGrid) {
        productsGrid.addEventListener('dragover', handleCardDragOver);
        productsGrid.addEventListener('drop', handleCardDrop);
        
        // Add drop indicators for product cards
        const cards = productsGrid.querySelectorAll('.page-card');
        cards.forEach(card => {
            if (!card.previousElementSibling || !card.previousElementSibling.classList.contains('card-drop-indicator')) {
                const dropIndicator = document.createElement('div');
                dropIndicator.className = 'card-drop-indicator';
                dropIndicator.style.cssText = 'display: none; width: 4px; height: 100%; background: #3498db; position: absolute; left: -2px; top: 0; border-radius: 2px; z-index: 50;';
                card.style.position = 'relative';
                productsGrid.insertBefore(dropIndicator, card);
            }
        });
    }

    // Add drop indicators
    sections.forEach(section => {
        if (section.id !== 'file-editor') {
            const dropIndicator = document.createElement('div');
            dropIndicator.className = 'drop-indicator';
            dropIndicator.style.cssText = 'display: none; height: 4px; background: #3498db; margin: 10px 0; border-radius: 2px;';
            section.parentNode.insertBefore(dropIndicator, section);
        }
    });

    // Load saved layout
    loadDashboardLayout();
    loadPageCardsLayout();
    
    // Reinitialize card drag and drop after layout is loaded
    setTimeout(reinitializeCardDragAndDrop, 100);
}

// Function to reinitialize card drag and drop (call this after dynamic content changes)
function reinitializeCardDragAndDrop() {
    // Remove existing drag handles and indicators
    document.querySelectorAll('.card-drag-handle').forEach(handle => handle.remove());
    document.querySelectorAll('.card-drop-indicator').forEach(indicator => indicator.remove());
    
    // Reinitialize drag and drop
    const pageCards = document.querySelectorAll('.page-card');
    pageCards.forEach(card => {
        card.draggable = true;
        card.addEventListener('dragstart', handleCardDragStart);
        card.addEventListener('dragend', handleCardDragEnd);
        
        // Add drag handle to page cards
        if (!card.querySelector('.card-drag-handle')) {
            const dragHandle = document.createElement('div');
            dragHandle.className = 'card-drag-handle';
            dragHandle.innerHTML = '<i class="fas fa-arrows-alt"></i>';
            dragHandle.title = 'Drag to reorder';
            dragHandle.style.cssText = 'position: absolute; top: 8px; right: 8px; cursor: grab; color: #666; font-size: 14px; opacity: 0.8; z-index: 100; background: rgba(255,255,255,0.9); padding: 2px; border-radius: 3px;';
            card.style.position = 'relative';
            card.appendChild(dragHandle);
        }
    });
    
    // Add drop indicators for cards
    const widgetsGrid = document.querySelector('.widgets-grid');
    if (widgetsGrid) {
        const cards = widgetsGrid.querySelectorAll('.page-card');
        cards.forEach(card => {
            if (!card.previousElementSibling || !card.previousElementSibling.classList.contains('card-drop-indicator')) {
                const dropIndicator = document.createElement('div');
                dropIndicator.className = 'card-drop-indicator';
                dropIndicator.style.cssText = 'display: none; width: 4px; height: 100%; background: #3498db; position: absolute; left: -2px; top: 0; border-radius: 2px; z-index: 50;';
                widgetsGrid.insertBefore(dropIndicator, card);
            }
        });
    }
    
    // Add drop indicators for send cards
    const sendCardsGrid = document.querySelector('.send-cards-grid');
    if (sendCardsGrid) {
        const cards = sendCardsGrid.querySelectorAll('.page-card');
        cards.forEach(card => {
            if (!card.previousElementSibling || !card.previousElementSibling.classList.contains('card-drop-indicator')) {
                const dropIndicator = document.createElement('div');
                dropIndicator.className = 'card-drop-indicator';
                dropIndicator.style.cssText = 'display: none; width: 4px; height: 100%; background: #3498db; position: absolute; left: -2px; top: 0; border-radius: 2px; z-index: 50;';
                sendCardsGrid.insertBefore(dropIndicator, card);
            }
        });
    }

    // Add drop indicators for product cards
    const productsGrid = document.querySelector('.products-grid');
    if (productsGrid) {
        const cards = productsGrid.querySelectorAll('.page-card');
        cards.forEach(card => {
            if (!card.previousElementSibling || !card.previousElementSibling.classList.contains('card-drop-indicator')) {
                const dropIndicator = document.createElement('div');
                dropIndicator.className = 'card-drop-indicator';
                dropIndicator.style.cssText = 'display: none; width: 4px; height: 100%; background: #3498db; position: absolute; left: -2px; top: 0; border-radius: 2px; z-index: 50;';
                productsGrid.insertBefore(dropIndicator, card);
            }
        });
    }
    
    // Reinitialize long press functionality
    initializeLongPressMove();
}

// Drag and drop event handlers
let draggedElement = null;

function handleDragStart(e) {
    draggedElement = e.target;
    e.target.style.opacity = '0.5';
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', e.target.outerHTML);
}

function handleDragEnd(e) {
    e.target.style.opacity = '1';
    draggedElement = null;
    
    // Hide all drop indicators
    document.querySelectorAll('.drop-indicator').forEach(indicator => {
        indicator.style.display = 'none';
    });
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    // Show drop indicators
    const afterElement = getDragAfterElement(e.clientY);
    const dropIndicators = document.querySelectorAll('.drop-indicator');
    
    dropIndicators.forEach(indicator => {
        indicator.style.display = 'none';
    });

    if (afterElement) {
        afterElement.previousElementSibling.style.display = 'block';
    }
}

function handleDrop(e) {
    e.preventDefault();
    
    if (!draggedElement) return;

    const afterElement = getDragAfterElement(e.clientY);
    
    if (afterElement) {
        draggedElement.parentNode.insertBefore(draggedElement, afterElement);
    } else {
        // Append to end
        document.querySelector('.content-area').appendChild(draggedElement);
    }

    // Save layout
    saveDashboardLayout();
}

// Page card drag and drop handlers
function handleCardDragStart(e) {
    draggedElement = e.target.closest('.page-card');
    if (draggedElement) {
        draggedElement.style.opacity = '0.5';
        draggedElement.style.transform = 'rotate(5deg)';
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', draggedElement.outerHTML);
    }
}

function handleCardDragEnd(e) {
    if (draggedElement) {
        draggedElement.style.opacity = '1';
        draggedElement.style.transform = 'rotate(0deg)';
    }
    draggedElement = null;
    
    // Hide all card drop indicators
    document.querySelectorAll('.card-drop-indicator').forEach(indicator => {
        indicator.style.display = 'none';
    });
}

function handleCardDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    // Show card drop indicators
    const afterElement = getCardDragAfterElement(e.clientX, e.clientY);
    const dropIndicators = document.querySelectorAll('.card-drop-indicator');
    
    dropIndicators.forEach(indicator => {
        indicator.style.display = 'none';
    });

    if (afterElement && afterElement !== draggedElement) {
        // Find the drop indicator before this element
        const indicator = afterElement.previousElementSibling;
        if (indicator && indicator.classList.contains('card-drop-indicator')) {
            indicator.style.display = 'block';
        }
    }
}

function handleCardDrop(e) {
    e.preventDefault();
    
    if (!draggedElement) return;

    const afterElement = getCardDragAfterElement(e.clientX, e.clientY);
    
    if (afterElement && afterElement !== draggedElement) {
        draggedElement.parentNode.insertBefore(draggedElement, afterElement);
    } else {
        // Append to end of widgets grid
        const widgetsGrid = document.querySelector('.widgets-grid');
        if (widgetsGrid && draggedElement.parentNode !== widgetsGrid) {
            widgetsGrid.appendChild(draggedElement);
        }
    }

    // Save page cards layout
    savePageCardsLayout();
}

function getDragAfterElement(y) {
    const draggableElements = [...document.querySelectorAll('.content-area > div:not(#file-editor)')];
    
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function getCardDragAfterElement(x, y) {
    // Check both grids
    const widgetsGrid = document.querySelector('.widgets-grid');
    const sendCardsGrid = document.querySelector('.send-cards-grid');
    
    let allCards = [];
    
    if (widgetsGrid) {
        allCards = allCards.concat(Array.from(widgetsGrid.querySelectorAll('.page-card')));
    }
    if (sendCardsGrid) {
        allCards = allCards.concat(Array.from(sendCardsGrid.querySelectorAll('.page-card')));
    }
    
    return allCards.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offsetX = x - box.left - box.width / 2;
        
        if (offsetX < 0 && offsetX > closest.offset) {
            return { offset: offsetX, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

// Save and load dashboard layout
function saveDashboardLayout() {
    const sections = document.querySelectorAll('.content-area > div');
    const layout = [];
    
    sections.forEach(section => {
        if (section.id !== 'file-editor') {
            layout.push(section.className.split(' ')[0]); // Get the main class name
        }
    });
    
    localStorage.setItem('dashboardLayout', JSON.stringify(layout));
}

function loadDashboardLayout() {
    const savedLayout = localStorage.getItem('dashboardLayout');
    if (!savedLayout) return;
    
    const layout = JSON.parse(savedLayout);
    const contentArea = document.querySelector('.content-area');
    const fileEditor = document.getElementById('file-editor');
    
    // Clear current layout (except file editor)
    const sections = contentArea.querySelectorAll(':scope > div:not(#file-editor)');
    sections.forEach(section => section.remove());
    
    // Rebuild layout
    layout.forEach(className => {
        const section = document.querySelector(`.${className}`);
        if (section) {
            contentArea.insertBefore(section, fileEditor);
        }
    });
}

// Long press to move functionality
let longPressTimer = null;
let isLongPressMode = false;
let selectedCard = null;
let originalPosition = null;

function initializeLongPressMove() {
    const pageCards = document.querySelectorAll('.page-card');
    pageCards.forEach(card => {
        let pressTimer = null;
        let startX, startY;
        
        card.addEventListener('mousedown', (e) => {
            if (isLongPressMode) return; // Already in long press mode
            
            startX = e.clientX;
            startY = e.clientY;
            
            // Start long press timer
            pressTimer = setTimeout(() => {
                startLongPressMode(card, e);
            }, 3000); // 3 seconds
            
            // Add visual feedback
            card.classList.add('long-press-pending');
        });
        
        card.addEventListener('mousemove', (e) => {
            if (pressTimer && (Math.abs(e.clientX - startX) > 10 || Math.abs(e.clientY - startY) > 10)) {
                // Mouse moved too much, cancel long press
                clearTimeout(pressTimer);
                pressTimer = null;
                card.classList.remove('long-press-pending');
            }
        });
        
        card.addEventListener('mouseup', () => {
            if (pressTimer) {
                clearTimeout(pressTimer);
                pressTimer = null;
                card.classList.remove('long-press-pending');
            }
        });
        
        card.addEventListener('mouseleave', () => {
            if (pressTimer) {
                clearTimeout(pressTimer);
                pressTimer = null;
                card.classList.remove('long-press-pending');
            }
        });
    });
    
    // Handle cursor following during long press mode
    document.addEventListener('mousemove', handleCursorFollow);
    document.addEventListener('mouseup', endLongPressMode);
}

function startLongPressMode(card, event) {
    isLongPressMode = true;
    selectedCard = card;
    
    // Store original position
    originalPosition = {
        parent: card.parentNode,
        nextSibling: card.nextSibling
    };
    
    // Visual feedback
    card.classList.remove('long-press-pending');
    card.classList.add('long-press-active');
    
    // Make card follow cursor
    card.style.position = 'fixed';
    card.style.zIndex = '1000';
    card.style.pointerEvents = 'none';
    card.style.transform = 'rotate(5deg) scale(1.05)';
    card.style.boxShadow = '0 8px 25px rgba(0,0,0,0.3)';
    
    // Position at cursor
    updateCardPosition(event.clientX, event.clientY);
    
    // Show instruction
    showLongPressInstruction();
}

function handleCursorFollow(event) {
    if (!isLongPressMode || !selectedCard) return;
    
    updateCardPosition(event.clientX, event.clientY);
}

function updateCardPosition(x, y) {
    if (!selectedCard) return;
    
    const cardRect = selectedCard.getBoundingClientRect();
    const offsetX = cardRect.width / 2;
    const offsetY = cardRect.height / 2;
    
    selectedCard.style.left = (x - offsetX) + 'px';
    selectedCard.style.top = (y - offsetY) + 'px';
}

function endLongPressMode(event) {
    if (!isLongPressMode || !selectedCard) return;
    
    // Find the drop target
    const widgetsGrid = document.querySelector('.widgets-grid');
    if (!widgetsGrid) {
        resetLongPressMode();
        return;
    }
    
    // Find the closest card to drop before/after
    const cards = Array.from(widgetsGrid.querySelectorAll('.page-card')).filter(card => card !== selectedCard);
    let dropTarget = null;
    let insertBefore = true;
    
    if (cards.length > 0) {
        const mouseX = event.clientX;
        const mouseY = event.clientY;
        
        // Find closest card horizontally
        dropTarget = cards.reduce((closest, card) => {
            const rect = card.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            const distance = Math.sqrt(Math.pow(mouseX - centerX, 2) + Math.pow(mouseY - centerY, 2));
            
            if (distance < closest.distance) {
                return { card, distance, centerX };
            }
            return closest;
        }, { card: null, distance: Infinity, centerX: 0 });
        
        if (dropTarget.card) {
            dropTarget = dropTarget.card;
            // Determine if to insert before or after based on horizontal position
            const targetRect = dropTarget.getBoundingClientRect();
            insertBefore = mouseX < targetRect.left + targetRect.width / 2;
        }
    }
    
    // Reset card styles
    selectedCard.style.position = '';
    selectedCard.style.left = '';
    selectedCard.style.top = '';
    selectedCard.style.zIndex = '';
    selectedCard.style.pointerEvents = '';
    selectedCard.style.transform = '';
    selectedCard.style.boxShadow = '';
    selectedCard.classList.remove('long-press-active');
    
    // Move card to new position
    if (dropTarget && insertBefore) {
        widgetsGrid.insertBefore(selectedCard, dropTarget);
    } else if (dropTarget && !insertBefore) {
        widgetsGrid.insertBefore(selectedCard, dropTarget.nextSibling);
    } else {
        widgetsGrid.appendChild(selectedCard);
    }
    
    // Save layout
    savePageCardsLayout();
    
    // Reset mode
    resetLongPressMode();
}

function resetLongPressMode() {
    isLongPressMode = false;
    selectedCard = null;
    originalPosition = null;
    
    // Hide instruction
    hideLongPressInstruction();
    
    // Remove any pending states
    document.querySelectorAll('.long-press-pending').forEach(el => {
        el.classList.remove('long-press-pending');
    });
}

function showLongPressInstruction() {
    let instruction = document.getElementById('long-press-instruction');
    if (!instruction) {
        instruction = document.createElement('div');
        instruction.id = 'long-press-instruction';
        instruction.innerHTML = `
            <div style="position: fixed; top: 20px; left: 50%; transform: translateX(-50%); 
                        background: #3498db; color: white; padding: 10px 20px; border-radius: 5px; 
                        z-index: 1001; font-size: 14px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);">
                <i class="fas fa-arrows-alt"></i> Card will follow your cursor - release to drop
            </div>
        `;
        document.body.appendChild(instruction);
    }
    instruction.style.display = 'block';
}

function hideLongPressInstruction() {
    const instruction = document.getElementById('long-press-instruction');
    if (instruction) {
        instruction.style.display = 'none';
    }
}

// Save and load page cards layout
function savePageCardsLayout() {
    // Save widgets grid layout
    const widgetsGrid = document.querySelector('.widgets-grid');
    if (widgetsGrid) {
        const cards = widgetsGrid.querySelectorAll('.page-card');
        const layout = [];
        
        cards.forEach(card => {
            const title = card.querySelector('.page-info h4');
            if (title) {
                layout.push(title.textContent.trim());
            }
        });
        
        localStorage.setItem('widgetsCardsLayout', JSON.stringify(layout));
    }
    
    // Save send cards grid layout
    const sendCardsGrid = document.querySelector('.send-cards-grid');
    if (sendCardsGrid) {
        const cards = sendCardsGrid.querySelectorAll('.page-card');
        const layout = [];
        
        cards.forEach(card => {
            const title = card.querySelector('.page-info h4');
            if (title) {
                layout.push(title.textContent.trim());
            }
        });
        
        localStorage.setItem('sendCardsLayout', JSON.stringify(layout));
    }

    // Save products grid layout
    const productsGrid = document.querySelector('.products-grid');
    if (productsGrid) {
        const cards = productsGrid.querySelectorAll('.page-card');
        const layout = [];
        
        cards.forEach(card => {
            const title = card.querySelector('.page-info h4');
            if (title) {
                layout.push(title.textContent.trim());
            }
        });
        
        localStorage.setItem('productsCardsLayout', JSON.stringify(layout));
    }
}

function loadPageCardsLayout() {
    // Load widgets grid layout
    const savedWidgetsLayout = localStorage.getItem('widgetsCardsLayout');
    if (savedWidgetsLayout) {
        const layout = JSON.parse(savedWidgetsLayout);
        const widgetsGrid = document.querySelector('.widgets-grid');
        if (widgetsGrid) {
            // Collect all existing cards
            const allCards = Array.from(document.querySelectorAll('.page-card'));
            const cardsMap = new Map();
            
            allCards.forEach(card => {
                const title = card.querySelector('.page-info h4');
                if (title) {
                    cardsMap.set(title.textContent.trim(), card);
                }
            });
            
            // Clear current cards
            widgetsGrid.innerHTML = '';
            
            // Rebuild layout in the saved order
            layout.forEach(cardTitle => {
                const card = cardsMap.get(cardTitle);
                if (card) {
                    widgetsGrid.appendChild(card);
                    cardsMap.delete(cardTitle);
                }
            });
            
            // Add any remaining cards
            cardsMap.forEach(card => {
                widgetsGrid.appendChild(card);
            });
        }
    }
    
    // Load send cards grid layout
    const savedSendLayout = localStorage.getItem('sendCardsLayout');
    if (savedSendLayout) {
        const layout = JSON.parse(savedSendLayout);
        const sendCardsGrid = document.querySelector('.send-cards-grid');
        if (sendCardsGrid) {
            // Collect all existing cards
            const allCards = Array.from(document.querySelectorAll('.page-card'));
            const cardsMap = new Map();
            
            allCards.forEach(card => {
                const title = card.querySelector('.page-info h4');
                if (title) {
                    cardsMap.set(title.textContent.trim(), card);
                }
            });
            
            // Clear current cards
            sendCardsGrid.innerHTML = '';
            
            // Rebuild layout in the saved order
            layout.forEach(cardTitle => {
                const card = cardsMap.get(cardTitle);
                if (card) {
                    sendCardsGrid.appendChild(card);
                    cardsMap.delete(cardTitle);
                }
            });
            
            // Add any remaining cards
            cardsMap.forEach(card => {
                sendCardsGrid.appendChild(card);
            });
        }
    }

    // Load products grid layout
    const savedProductsLayout = localStorage.getItem('productsCardsLayout');
    if (savedProductsLayout) {
        const layout = JSON.parse(savedProductsLayout);
        const productsGrid = document.querySelector('.products-grid');
        if (productsGrid) {
            // Collect all existing cards
            const allCards = Array.from(document.querySelectorAll('.page-card'));
            const cardsMap = new Map();
            
            allCards.forEach(card => {
                const title = card.querySelector('.page-info h4');
                if (title) {
                    cardsMap.set(title.textContent.trim(), card);
                }
            });
            
            // Clear current cards
            productsGrid.innerHTML = '';
            
            // Rebuild layout in the saved order
            layout.forEach(cardTitle => {
                const card = cardsMap.get(cardTitle);
                if (card) {
                    productsGrid.appendChild(card);
                    cardsMap.delete(cardTitle);
                }
            });
            
            // Add any remaining cards
            cardsMap.forEach(card => {
                productsGrid.appendChild(card);
            });
        }
    }
}

// Load file tree structure
async function loadFileTree() {
    try {
        const response = await fetch('/api/dashboard/files/tree', {
            headers: getAuthHeaders()
        });
        const data = await response.json();

        if (data.success) {
            fileTree = data.tree;
            renderFileTree(data.tree);
        } else {
            console.warn('File tree not available:', data.message);
            // Show empty file tree or demo data
            renderFileTree({});
        }
    } catch (error) {
        console.warn('File tree API not available, showing demo structure');
        // Show demo file tree structure
        const demoTree = {
            'backend': true,
            'logs': true,
            'uploads': true,
            'admin.html': false,
            'dashboard.html': false,
            'index.html': false
        };
        renderFileTree(demoTree);
    }
}

// Load website pages for quick access
function loadWebsitePages() {
    const pages = [
        { name: 'blog-admin.html', icon: 'fa-blog', color: '#9b59b6', description: 'Blog Admin' },
        { name: 'blog.html', icon: 'fa-newspaper', color: '#3498db', description: 'Blog Page' },
        { name: 'cartpage.html', icon: 'fa-shopping-cart', color: '#e67e22', description: 'Shopping Cart' },
        { name: 'checkout.html', icon: 'fa-credit-card', color: '#27ae60', description: 'Checkout' },
        { name: 'forgot-password.html', icon: 'fa-key', color: '#95a5a6', description: 'Password Reset' },
        { name: 'login.html', icon: 'fa-sign-in-alt', color: '#34495e', description: 'Login Page' },
        { name: 'marketplace.html', icon: 'fa-store', color: '#16a085', description: 'Marketplace' },
        { name: 'media-library.html', icon: 'fa-images', color: '#8e44ad', description: 'Media Library' },
        { name: 'notifications.html', icon: 'fa-bell', color: '#f1c40f', description: 'Notifications' },
        { name: 'ordermanagement.html', icon: 'fa-clipboard-list', color: '#e74c3c', description: 'Order Management' },
        { name: 'profile.html', icon: 'fa-user', color: '#3498db', description: 'User Profile' },
        { name: 'signup.html', icon: 'fa-user-plus', color: '#2ecc71', description: 'Sign Up' },
        { name: 'support.html', icon: 'fa-headset', color: '#9b59b6', description: 'Support' },
        { name: 'user-management.html', icon: 'fa-users-cog', color: '#e67e22', description: 'User Management' },
        { name: 'products.html', icon: 'fa-box', color: '#f39c12', description: 'Products Page' }
    ];

    // Store pages globally for other functions
    window.websitePages = pages;

    // Populate sidebar pages list
    const pagesList = document.getElementById('pages-list');
    pagesList.innerHTML = '';

    pages.forEach(page => {
        const li = document.createElement('li');
        li.innerHTML = `
            <a href="#" onclick="editPage('${page.name}')">
                <i class="fas ${page.icon} page-icon"></i>
                <span class="page-name">${page.name.replace('.html', '').replace('-', ' ')}</span>
            </a>
        `;
        pagesList.appendChild(li);
    });

    // Populate page selector for widgets
    const pageSelector = document.getElementById('selected-page');
    if (pageSelector) {
        pageSelector.innerHTML = '<option value="">Choose a page...</option>';

        pages.forEach(page => {
            const option = document.createElement('option');
            option.value = page.name;
            option.textContent = page.name.replace('.html', '').replace('-', ' ');
            pageSelector.appendChild(option);
        });
    }

    // Populate main content pages grid
    const pagesGrid = document.getElementById('pages-grid');
    pagesGrid.innerHTML = '';

    pages.forEach(page => {
        const pageCard = document.createElement('div');
        pageCard.className = 'page-card';
        pageCard.onclick = () => editPage(page.name);
        pageCard.innerHTML = `
            <div class="page-icon" style="color: ${page.color}">
                <i class="fas ${page.icon}"></i>
            </div>
            <div class="page-info">
                <h4>${page.name.replace('.html', '').replace('-', ' ')}</h4>
                <p>${page.description}</p>
            </div>
            <div class="page-actions">
                <button onclick="viewPage('${page.name}'); event.stopPropagation();" class="view-btn" title="View with Live Server">
                    <i class="fas fa-eye"></i> View
                </button>
                <button onclick="editPage('${page.name}'); event.stopPropagation();" class="edit-btn" title="Edit in VS Code">
                    <i class="fas fa-code"></i> Edit in VS Code
                </button>
                <button onclick="quickEditPage('${page.name}'); event.stopPropagation();" class="quick-edit-btn" title="Quick Edit in Dashboard">
                    <i class="fas fa-edit"></i> Quick Edit
                </button>
            </div>
        `;
        pagesGrid.appendChild(pageCard);
    });
}

// Render file tree in sidebar
function renderFileTree(tree) {
    const fileTreeElement = document.getElementById('file-tree');
    fileTreeElement.innerHTML = '';

    // Define folder priority order
    const priorityFolders = ['backend', 'logs', 'node_modules', 'uploads'];

    // Sort folders with priority
    const sortedFolders = Object.keys(tree).sort((a, b) => {
        const aPriority = priorityFolders.indexOf(a);
        const bPriority = priorityFolders.indexOf(b);

        if (aPriority !== -1 && bPriority !== -1) {
            return aPriority - bPriority;
        }
        if (aPriority !== -1) return -1;
        if (bPriority !== -1) return 1;
        return a.localeCompare(b);
    });

    sortedFolders.forEach(folder => {
        const li = document.createElement('li');
        li.innerHTML = `
            <a href="#" onclick="navigateToFolder('${folder}')">
                <i class="fas fa-folder folder-icon"></i>
                <span class="folder-name">${folder}</span>
            </a>
        `;
        fileTreeElement.appendChild(li);
    });
}

// Navigate to folder
function navigateToFolder(folder) {
    currentPath = `/${folder}`;
    document.getElementById('current-path').textContent = currentPath;
    loadFiles(currentPath);

    // Update active state in sidebar
    document.querySelectorAll('#file-tree a').forEach(link => {
        link.classList.remove('active');
    });
    event.target.closest('a').classList.add('active');
}

// Load files for current path
async function loadFiles(path) {
    const fileList = document.getElementById('file-list');
    if (!fileList) {
        // File manager section is not present on this dashboard variant.
        return;
    }
    fileList.innerHTML = '<div class="loading"><div class="spinner"></div>Loading files...</div>';

    try {
        const response = await fetch(`/api/dashboard/files/list?path=${encodeURIComponent(path)}`, {
            headers: getAuthHeaders()
        });
        const data = await response.json();

        if (data.success) {
            renderFileList(data.files);
            document.getElementById('file-count').textContent = `${data.files.length} items`;
            updateStats(data.files);
        } else {
            showNotification('Error loading files: ' + data.message, 'error');
            fileList.innerHTML = '<div class="loading">Error loading files</div>';
        }
    } catch (error) {
        console.warn('Files API not available, showing demo files');
        // Show demo files
        const demoFiles = [
            { name: 'index.html', type: 'file', size: '2.3 KB', modified: '2025-12-08' },
            { name: 'dashboard.html', type: 'file', size: '45.6 KB', modified: '2025-12-08' },
            { name: 'admin.html', type: 'file', size: '89.2 KB', modified: '2025-12-08' },
            { name: 'backend', type: 'folder', size: '-', modified: '2025-12-08' },
            { name: 'logs', type: 'folder', size: '-', modified: '2025-12-08' }
        ];
        renderFileList(demoFiles);
        document.getElementById('file-count').textContent = `${demoFiles.length} items`;
        updateStats(demoFiles);
    }
}

// Render file list
function renderFileList(files) {
    const fileList = document.getElementById('file-list');

    fileList.className = 'file-list';
    fileList.innerHTML = '';

    files.forEach(file => {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        fileItem.onclick = () => selectFile(file);

        const icon = file.type === 'directory' ? 'fa-folder' : getFileIcon(file.name);
        const size = file.type === 'directory' ? '' : formatFileSize(file.size);

        fileItem.innerHTML = `
            <div class="file-icon">
                <i class="fas ${icon}"></i>
            </div>
            <div class="file-details">
                <div class="file-name">${file.name}</div>
                <div class="file-meta">
                    ${file.type === 'directory' ? 'Folder' : 'File'} • ${size} • ${formatDate(file.modified)}
                </div>
            </div>
            <div class="file-actions">
                ${file.type === 'file' ? '<button onclick="editFile(\'' + file.name + '\', event)"><i class="fas fa-edit"></i></button>' : ''}
                <button onclick="deleteItem('${file.name}', '${file.type}', event)" class="delete-btn">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;

        fileList.appendChild(fileItem);
    });
}

// Render grid view
// Get file icon based on extension
function getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();

    const iconMap = {
        'html': 'fa-file-code',
        'css': 'fa-file-code',
        'js': 'fa-file-code',
        'json': 'fa-file-code',
        'md': 'fa-file-alt',
        'txt': 'fa-file-alt',
        'jpg': 'fa-file-image',
        'jpeg': 'fa-file-image',
        'png': 'fa-file-image',
        'gif': 'fa-file-image',
        'svg': 'fa-file-image',
        'pdf': 'fa-file-pdf',
        'zip': 'fa-file-archive',
        'rar': 'fa-file-archive'
    };

    return iconMap[ext] || 'fa-file';
}

// Format file size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Format date
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
}

// Toggle view mode
// Select file
function selectFile(file) {
    selectedFile = file;
    if (file.type === 'directory') {
        currentPath = currentPath === '/' ? `/${file.name}` : `${currentPath}/${file.name}`;
        document.getElementById('current-path').textContent = currentPath;
        loadFiles(currentPath);
    }
}

// Edit file
async function editFile(filename, event) {
    event.stopPropagation();

    try {
        const response = await fetch(`/api/dashboard/files/read?path=${encodeURIComponent(currentPath)}&file=${encodeURIComponent(filename)}`, {
            headers: getAuthHeaders()
        });
        const data = await response.json();

        if (data.success) {
            document.getElementById('editing-file').textContent = filename;
            document.getElementById('file-size').textContent = formatFileSize(data.size);
            document.getElementById('file-content').value = data.content;
            document.getElementById('file-editor').style.display = 'flex';
            document.querySelector('.save-btn').innerHTML = '<i class="fas fa-save"></i> Save';
            document.querySelector('.save-btn').style.backgroundColor = '#27ae60';
        } else {
            showNotification('Error reading file: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('Error reading file:', error);
        showNotification('Error reading file', 'error');
    }
}

// Edit a specific page
function editPage(pageName) {
    editFile(pageName, { stopPropagation: () => {} });
}

// Save file
async function saveFile() {
    const content = document.getElementById('file-content').value;
    const filename = document.getElementById('editing-file').textContent;

    try {
        const response = await fetch('/api/dashboard/files/save', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...getAuthHeaders()
            },
            body: JSON.stringify({
                path: currentPath,
                filename: filename,
                content: content
            })
        });

        const data = await response.json();

        if (data.success) {
            showNotification('File saved successfully', 'success');
            document.querySelector('.save-btn').innerHTML = '<i class="fas fa-save"></i> Save';
            document.querySelector('.save-btn').style.backgroundColor = '#27ae60';
            loadFiles(currentPath); // Refresh file list
        } else {
            showNotification('Error saving file: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('Error saving file:', error);
        showNotification('Error saving file', 'error');
    }
}

// Close editor
function closeEditor() {
    document.getElementById('file-editor').style.display = 'none';
    document.getElementById('editing-file').textContent = 'No file selected';
    document.getElementById('file-content').value = '';
}

// Create new file
function createNewFile() {
    document.getElementById('new-file-modal').style.display = 'block';
    document.getElementById('new-file-name').focus();
}

// Confirm create file
async function confirmCreateFile() {
    const filename = document.getElementById('new-file-name').value.trim();

    if (!filename) {
        showNotification('Please enter a file name', 'error');
        return;
    }

    try {
        const response = await fetch('/api/dashboard/files/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...getAuthHeaders()
            },
            body: JSON.stringify({
                path: currentPath,
                name: filename,
                type: 'file'
            })
        });

        const data = await response.json();

        if (data.success) {
            showNotification('File created successfully', 'success');
            closeModal('new-file-modal');
            document.getElementById('new-file-name').value = '';
            loadFiles(currentPath);
        } else {
            showNotification('Error creating file: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('Error creating file:', error);
        showNotification('Error creating file', 'error');
    }
}

// Create new folder
function createNewFolder() {
    document.getElementById('new-folder-modal').style.display = 'block';
    document.getElementById('new-folder-name').focus();
}

// Confirm create folder
async function confirmCreateFolder() {
    const foldername = document.getElementById('new-folder-name').value.trim();

    if (!foldername) {
        showNotification('Please enter a folder name', 'error');
        return;
    }

    try {
        const response = await fetch('/api/dashboard/files/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...getAuthHeaders()
            },
            body: JSON.stringify({
                path: currentPath,
                name: foldername,
                type: 'directory'
            })
        });

        const data = await response.json();

        if (data.success) {
            showNotification('Folder created successfully', 'success');
            closeModal('new-folder-modal');
            document.getElementById('new-folder-name').value = '';
            loadFiles(currentPath);
            loadFileTree(); // Refresh sidebar
        } else {
            showNotification('Error creating folder: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('Error creating folder:', error);
        showNotification('Error creating folder', 'error');
    }
}

// Delete item
function deleteItem(name, type, event) {
    event.stopPropagation();
    document.getElementById('delete-item-name').textContent = name;
    document.getElementById('delete-confirm-modal').style.display = 'block';

    // Store delete info for confirmation
    document.getElementById('delete-confirm-modal').dataset.name = name;
    document.getElementById('delete-confirm-modal').dataset.type = type;
}

// Confirm delete
async function confirmDelete() {
    const modal = document.getElementById('delete-confirm-modal');
    const name = modal.dataset.name;
    const type = modal.dataset.type;

    try {
        const response = await fetch('/api/dashboard/files/delete', {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                ...getAuthHeaders()
            },
            body: JSON.stringify({
                path: currentPath,
                name: name,
                type: type
            })
        });

        const data = await response.json();

        if (data.success) {
            showNotification(`${type === 'directory' ? 'Folder' : 'File'} deleted successfully`, 'success');
            closeModal('delete-confirm-modal');
            loadFiles(currentPath);
            if (type === 'directory') {
                loadFileTree(); // Refresh sidebar
            }
        } else {
            showNotification('Error deleting item: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('Error deleting item:', error);
        showNotification('Error deleting item', 'error');
    }
}

// Search files
function searchFiles() {
    const query = document.getElementById('search-input').value.trim();
    if (!query) {
        loadFiles(currentPath);
        return;
    }

    // Implement search functionality
    showNotification('Search functionality coming soon', 'info');
}

// Refresh files
function refreshFiles() {
    loadFiles(currentPath);
    loadFileTree();
    showNotification('Files refreshed', 'info');
}

// ========== PAGE MANAGEMENT ==========

// View page with live server
function viewPage(pageName) {
    window.open(pageName, '_blank');
    showNotification(`Opening ${pageName} in new tab`, 'info');
}

// Edit page (open in VS Code)
function editPage(pageName) {
    // Construct the full file path
    const workspacePath = 'c:\\Users\\Khan Saheb On\\Project Work\\BuyPvaAccount';
    const fullPath = `${workspacePath}\\${pageName}`;

    // Encode the path for the vscode:// protocol
    const encodedPath = encodeURIComponent(fullPath);

    // Open in VS Code using vscode:// protocol
    const vscodeUrl = `vscode://file/${encodedPath}`;
    window.open(vscodeUrl, '_self');

    showNotification(`Opening ${pageName} in VS Code`, 'info');
}

// Quick edit page (open in dashboard editor)
async function quickEditPage(pageName) {
    try {
        // Read the file content
        const response = await fetch(`/api/dashboard/files/read?path=/&file=${encodeURIComponent(pageName)}`, {
            headers: getAuthHeaders()
        });
        const data = await response.json();

        if (data.success) {
            // Populate the modal
            document.getElementById('quick-edit-filename').textContent = pageName;
            document.getElementById('quick-edit-code').value = data.content;

            // Store current file info
            window.currentEditingFile = pageName;
            window.originalContent = data.content;

            // Show the modal
            document.getElementById('quick-edit-modal').style.display = 'block';

            // Initialize live preview
            updateLivePreview();

            // Remove any existing listener and add new one
            const codeTextarea = document.getElementById('quick-edit-code');
            if (window.livePreviewListener) {
                codeTextarea.removeEventListener('input', window.livePreviewListener);
            }
            window.livePreviewListener = debounce(updateLivePreview, 500);
            codeTextarea.addEventListener('input', window.livePreviewListener);

            showNotification(`Opened ${pageName} for quick editing`, 'success');
        } else {
            showNotification('Error reading file: ' + data.message, 'error');
        }
    } catch (error) {
        showNotification('Error loading file for editing', 'error');
    }
}

// Load widgets for selected page
function loadPageWidgets() {
    const selectedPage = document.getElementById('selected-page').value;
    const canvas = document.getElementById('page-canvas');

    if (!selectedPage) {
        canvas.innerHTML = `
            <div class="canvas-placeholder">
                <i class="fas fa-plus-circle"></i>
                <p>Select a page above and drag widgets here to build your page</p>
            </div>
        `;
        return;
    }

    // Load saved widgets from localStorage
    const savedWidgets = JSON.parse(localStorage.getItem(`page_widgets_${selectedPage}`) || '[]');

    if (savedWidgets.length === 0) {
        canvas.innerHTML = `
            <div class="canvas-placeholder">
                <i class="fas fa-plus-circle"></i>
                <p>No widgets saved for this page. Drag widgets here to build your page</p>
            </div>
        `;
    } else {
        canvas.innerHTML = '';
        savedWidgets.forEach(widgetData => {
            const widgetInstance = createWidgetElement(widgetData.type);
            canvas.appendChild(widgetInstance);
        });
    }

    showNotification(`Loaded ${savedWidgets.length} widgets for ${selectedPage}`, 'success');
}

// Save page widgets
function savePageWidgets() {
    const selectedPage = document.getElementById('selected-page').value;
    const canvas = document.getElementById('page-canvas');

    if (!selectedPage) {
        showNotification('Please select a page first', 'error');
        return;
    }

    const widgets = [];
    const widgetElements = canvas.querySelectorAll('.widget-instance');

    widgetElements.forEach(widget => {
        const widgetType = widget.getAttribute('data-widget-type');
        widgets.push({ type: widgetType });
    });

    localStorage.setItem(`page_widgets_${selectedPage}`, JSON.stringify(widgets));
    showNotification(`Saved ${widgets.length} widgets to ${selectedPage}`, 'success');
}

// Clear page widgets
function clearPageWidgets() {
    const selectedPage = document.getElementById('selected-page').value;
    const canvas = document.getElementById('page-canvas');

    if (!selectedPage) {
        showNotification('Please select a page first', 'error');
        return;
    }

    if (confirm('Are you sure you want to clear all widgets from this page?')) {
        canvas.innerHTML = `
            <div class="canvas-placeholder">
                <i class="fas fa-plus-circle"></i>
                <p>Drag widgets here to build your page</p>
            </div>
        `;

        localStorage.removeItem(`page_widgets_${selectedPage}`);
        showNotification('Cleared all widgets from page', 'success');
    }
}

// Toggle sidebar
function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const mainContent = document.querySelector('.main-content');

    sidebar.classList.toggle('collapsed');
    mainContent.classList.toggle('expanded');
}

// ========== QUICK EDIT MODAL FUNCTIONS ==========

// Close quick edit modal
function closeQuickEditModal() {
    document.getElementById('quick-edit-modal').style.display = 'none';
    // Remove event listener
    const codeTextarea = document.getElementById('quick-edit-code');
    if (window.livePreviewListener) {
        codeTextarea.removeEventListener('input', window.livePreviewListener);
    }
}

// Save quick edit changes
async function saveQuickEdit() {
    const content = document.getElementById('quick-edit-code').value;
    const filename = window.currentEditingFile;

    if (!filename) {
        showNotification('No file selected', 'error');
        return;
    }

    try {
        const response = await fetch('/api/dashboard/files/save', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...getAuthHeaders()
            },
            body: JSON.stringify({
                path: '/',
                filename: filename,
                content: content
            })
        });

        const data = await response.json();

        if (data.success) {
            showNotification('File saved successfully!', 'success');
            window.originalContent = content;
            updateLivePreview(); // Refresh preview with saved content
        } else {
            showNotification('Error saving file: ' + data.message, 'error');
        }
    } catch (error) {
        showNotification('Error saving file', 'error');
    }
}

// Update live preview
function updateLivePreview() {
    const code = document.getElementById('quick-edit-code').value;
    const iframe = document.getElementById('live-preview-iframe');

    if (!code.trim()) {
        iframe.src = 'about:blank';
        return;
    }

    // Create a data URL with the HTML content
    const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(code);
    iframe.src = dataUrl;
}

// Refresh preview
function refreshPreview() {
    updateLivePreview();
    showNotification('Preview refreshed', 'info');
}

// Toggle preview size
function togglePreviewSize() {
    const modalContent = document.querySelector('.quick-edit-modal-content');
    const previewSection = document.querySelector('.live-preview-section');
    const codeSection = document.querySelector('.code-editor-section');

    if (modalContent.classList.contains('preview-expanded')) {
        modalContent.classList.remove('preview-expanded');
        previewSection.style.width = '50%';
        codeSection.style.width = '50%';
    } else {
        modalContent.classList.add('preview-expanded');
        previewSection.style.width = '70%';
        codeSection.style.width = '30%';
    }
}

// Format code (basic HTML formatting)
function formatCode() {
    const textarea = document.getElementById('quick-edit-code');
    let code = textarea.value;

    // Basic HTML formatting
    code = code.replace(/></g, '>\n<');
    code = code.replace(/(<[^>]+>)/g, '$1\n');
    code = code.replace(/\n\s*\n/g, '\n');
    code = code.trim();

    textarea.value = code;
    updateLivePreview();
    showNotification('Code formatted', 'info');
}

// Debounce utility function
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Close modal
function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

// Show notification
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Logout
function logout() {
    if (confirm('Are you sure you want to logout?')) {
        // Clear all admin authentication data
        localStorage.removeItem('adminLoggedIn');
        localStorage.removeItem('adminToken');
        localStorage.removeItem('admin_auth_token');
        // Redirect to admin login page
        window.location.href = 'admin.html';
    }
}

// Update dashboard stats
function updateStats(files) {
    const folders = files.filter(file => file.type === 'directory').length;
    const totalFiles = files.filter(file => file.type === 'file').length;
    const editableFiles = files.filter(file => {
        if (file.type !== 'file') return false;
        const ext = file.name.split('.').pop().toLowerCase();
        return ['html', 'css', 'js', 'json', 'txt', 'md', 'xml', 'yml', 'yaml', 'ini', 'conf', 'log'].includes(ext);
    }).length;

    document.getElementById('total-folders').textContent = folders;
    document.getElementById('total-files').textContent = totalFiles;
    document.getElementById('editable-files').textContent = editableFiles;
}

// ========== WIDGET SYSTEM ==========

// Add widget to canvas
function addWidget(widgetType) {
    const canvas = document.getElementById('page-canvas');
    const placeholder = canvas.querySelector('.canvas-placeholder');

    if (placeholder) {
        placeholder.remove();
    }

    const widgetInstance = createWidgetElement(widgetType);
    canvas.appendChild(widgetInstance);

    showNotification(`Added ${widgetType.replace('-', ' ')} widget`, 'success');
}

// Create widget element
function createWidgetElement(widgetType) {
    const widgetData = {
        'hero-banner': {
            icon: 'fa-image',
            title: 'Hero Banner',
            content: '<div class="hero-content"><h1>Welcome to Our Store</h1><p>Discover amazing products</p><button class="btn btn-primary">Shop Now</button></div>'
        },
        'text-block': {
            icon: 'fa-paragraph',
            title: 'Text Block',
            content: '<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>'
        },
        'product-grid': {
            icon: 'fa-th',
            title: 'Product Grid',
            content: '<div class="product-grid-placeholder"><p>Product grid will be displayed here</p></div>'
        },
        'testimonial': {
            icon: 'fa-quote-left',
            title: 'Testimonial',
            content: '<blockquote>"This is an amazing service!"<cite>- Happy Customer</cite></blockquote>'
        },
        'contact-form': {
            icon: 'fa-envelope',
            title: 'Contact Form',
            content: '<form class="contact-form"><input type="text" placeholder="Name"><input type="email" placeholder="Email"><textarea placeholder="Message"></textarea><button type="submit">Send</button></form>'
        },
        'social-links': {
            icon: 'fa-share-alt',
            title: 'Social Links',
            content: '<div class="social-links"><a href="#"><i class="fab fa-facebook"></i></a><a href="#"><i class="fab fa-twitter"></i></a><a href="#"><i class="fab fa-instagram"></i></a></div>'
        },
        'image-gallery': {
            icon: 'fa-images',
            title: 'Image Gallery',
            content: '<div class="gallery-placeholder"><p>Image gallery will be displayed here</p></div>'
        },
        'video-player': {
            icon: 'fa-play-circle',
            title: 'Video Player',
            content: '<div class="video-placeholder"><i class="fas fa-play-circle"></i><p>Video player will be displayed here</p></div>'
        }
    };

    const data = widgetData[widgetType];
    const widget = document.createElement('div');
    widget.className = 'widget-instance';
    widget.draggable = true;
    widget.setAttribute('data-widget-type', widgetType); // Store widget type
    widget.ondragstart = (e) => dragWidgetInstance(e);

    widget.innerHTML = `
        <div class="widget-header">
            <div class="widget-title">
                <i class="fas ${data.icon}"></i> ${data.title}
            </div>
            <div class="widget-actions">
                <button onclick="editWidget(this.parentElement.parentElement)" title="Edit">
                    <i class="fas fa-edit"></i>
                </button>
                <button onclick="deleteWidget(this.parentElement.parentElement)" title="Delete">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
        <div class="widget-content">
            ${data.content}
        </div>
    `;

    return widget;
}

// Drag and drop functions
function dragWidget(event, widgetType) {
    event.dataTransfer.setData('widgetType', widgetType);
}

function allowDrop(event) {
    event.preventDefault();
}

function dropWidget(event) {
    event.preventDefault();
    const widgetType = event.dataTransfer.getData('widgetType');

    if (widgetType) {
        addWidget(widgetType);
    }
}

function dragWidgetInstance(event) {
    // Handle dragging existing widgets
    event.dataTransfer.setData('widgetInstance', 'true');
}

// Edit widget
function editWidget(widgetElement) {
    const title = widgetElement.querySelector('.widget-title').textContent;
    showNotification(`Editing ${title}`, 'info');
    // TODO: Implement widget editing modal
}

// Delete widget
function deleteWidget(widgetElement) {
    const title = widgetElement.querySelector('.widget-title').textContent;
    if (confirm(`Are you sure you want to delete the ${title} widget?`)) {
        widgetElement.remove();
        showNotification(`Deleted ${title}`, 'success');

        // Add placeholder back if no widgets
        const canvas = document.getElementById('page-canvas');
        if (canvas.children.length === 0) {
            canvas.innerHTML = `
                <div class="canvas-placeholder">
                    <i class="fas fa-plus-circle"></i>
                    <p>Drag widgets here to build your page</p>
                </div>
            `;
        }
    }
}

// ========== REMINDERS SYSTEM ==========

// Load reminders
function loadReminders() {
    // Load from localStorage for demo (in production, this would be from server)
    const reminders = JSON.parse(localStorage.getItem('dashboard_reminders') || '[]');
    renderReminders(reminders);
}

// Render reminders
function renderReminders(reminders) {
    const container = document.getElementById('reminders-list');
    if (!container) {
        // Reminders widget is not present on this dashboard variant.
        return;
    }

    if (reminders.length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-clock"></i><p>No reminders yet</p></div>';
        return;
    }

    container.innerHTML = reminders.map((reminder, index) => `
        <div class="reminder-item ${reminder.priority} ${reminder.completed ? 'completed' : ''}">
            <div class="reminder-icon">
                <i class="fas ${reminder.completed ? 'fa-check-circle' : 'fa-clock'}"></i>
            </div>
            <div class="reminder-content">
                <div class="reminder-title">${reminder.title}</div>
                <div class="reminder-description">${reminder.description || ''}</div>
                <div class="reminder-meta">
                    ${reminder.dueDate ? `Due: ${new Date(reminder.dueDate).toLocaleString()}` : ''}
                    <span class="priority-badge ${reminder.priority}">${reminder.priority}</span>
                </div>
            </div>
            <div class="reminder-actions">
                <button onclick="toggleReminder(${index})" title="${reminder.completed ? 'Mark Incomplete' : 'Mark Complete'}">
                    <i class="fas ${reminder.completed ? 'fa-undo' : 'fa-check'}"></i>
                </button>
                <button onclick="deleteReminder(${index})" title="Delete">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `).join('');
}

// Open reminder modal
function openReminderModal() {
    document.getElementById('reminder-modal').style.display = 'block';
    document.getElementById('reminder-title').focus();
}

// Save reminder
function saveReminder() {
    const title = document.getElementById('reminder-title').value.trim();
    const description = document.getElementById('reminder-description').value.trim();
    const dueDate = document.getElementById('reminder-due-date').value;
    const priority = document.getElementById('reminder-priority').value;

    if (!title) {
        showNotification('Please enter a reminder title', 'error');
        return;
    }

    const reminders = JSON.parse(localStorage.getItem('dashboard_reminders') || '[]');
    reminders.push({
        title,
        description,
        dueDate,
        priority,
        completed: false,
        createdAt: new Date().toISOString()
    });

    localStorage.setItem('dashboard_reminders', JSON.stringify(reminders));
    renderReminders(reminders);

    closeModal('reminder-modal');
    document.getElementById('reminder-title').value = '';
    document.getElementById('reminder-description').value = '';
    document.getElementById('reminder-due-date').value = '';

    showNotification('Reminder created successfully', 'success');
}

// Toggle reminder completion
function toggleReminder(index) {
    const reminders = JSON.parse(localStorage.getItem('dashboard_reminders') || '[]');
    reminders[index].completed = !reminders[index].completed;
    localStorage.setItem('dashboard_reminders', JSON.stringify(reminders));
    renderReminders(reminders);
}

// Delete reminder
function deleteReminder(index) {
    if (confirm('Are you sure you want to delete this reminder?')) {
        const reminders = JSON.parse(localStorage.getItem('dashboard_reminders') || '[]');
        reminders.splice(index, 1);
        localStorage.setItem('dashboard_reminders', JSON.stringify(reminders));
        renderReminders(reminders);
        showNotification('Reminder deleted', 'success');
    }
}

// Open note modal
function openNoteModal() {
    document.getElementById('note-modal').style.display = 'block';
    document.getElementById('note-title').focus();
}

// Save note
function saveNote() {
    const title = document.getElementById('note-title').value.trim();
    const content = document.getElementById('note-content').value.trim();
    const category = document.getElementById('note-category').value;

    if (!title || !content) {
        showNotification('Please fill in all required fields', 'error');
        return;
    }

    const note = {
        id: Date.now(),
        title: title,
        content: content,
        category: category,
        createdAt: new Date().toISOString()
    };

    // Save to localStorage (in production, this would be sent to server)
    const notes = JSON.parse(localStorage.getItem('dashboard_notes') || '[]');
    notes.push(note);
    localStorage.setItem('dashboard_notes', JSON.stringify(notes));

    // Reset form and close modal
    document.getElementById('note-title').value = '';
    document.getElementById('note-content').value = '';
    document.getElementById('note-category').value = 'general';
    closeModal('note-modal');

    showNotification('Note saved successfully!', 'success');
}

// Open comment modal
function openCommentModal() {
    // Load available pages for the post selection
    loadPagesForComments();
    document.getElementById('comment-modal').style.display = 'block';
    document.getElementById('comment-author').focus();
}

// Load pages for comment post selection
function loadPagesForComments() {
    const select = document.getElementById('comment-post');
    // Clear existing options except the first one
    select.innerHTML = '<option value="" selected>Select a page...</option>';

    // Add available pages (you can modify this to load from your actual pages)
    const pages = ['index.html', 'marketplace.html', 'contact.html', 'about.html', 'blog.html'];
    pages.forEach(page => {
        const option = document.createElement('option');
        option.value = page;
        option.textContent = page;
        select.appendChild(option);
    });
}

// Save comment
function saveComment() {
    const author = document.getElementById('comment-author').value.trim();
    const email = document.getElementById('comment-email').value.trim();
    const content = document.getElementById('comment-content').value.trim();
    const post = document.getElementById('comment-post').value;

    if (!author || !content) {
        showNotification('Please fill in all required fields', 'error');
        return;
    }

    const comment = {
        id: Date.now(),
        author: author,
        email: email,
        content: content,
        post: post,
        createdAt: new Date().toISOString(),
        status: 'pending' // pending, approved, rejected
    };

    // Save to localStorage (in production, this would be sent to server)
    const comments = JSON.parse(localStorage.getItem('dashboard_comments') || '[]');
    comments.push(comment);
    localStorage.setItem('dashboard_comments', JSON.stringify(comments));

    // Reset form and close modal
    document.getElementById('comment-author').value = '';
    document.getElementById('comment-email').value = '';
    document.getElementById('comment-content').value = '';
    document.getElementById('comment-post').value = '';
    closeModal('comment-modal');

    showNotification('Comment submitted successfully!', 'success');
}

// ========== NOTIFICATIONS SYSTEM ==========

// Load notifications
function loadNotifications() {
    // Load from localStorage for demo (in production, this would be from server)
    const notifications = JSON.parse(localStorage.getItem('dashboard_notifications') || '[]');
    renderNotifications(notifications);
}

// Render notifications
function renderNotifications(notifications) {
    const container = document.getElementById('notifications-list');

    if (notifications.length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-bell"></i><p>No notifications yet</p></div>';
        return;
    }

    container.innerHTML = notifications.map((notification, index) => `
        <div class="notification-item ${notification.read ? '' : 'unread'}">
            <div class="notification-icon">
                <i class="fas ${getNotificationIcon(notification.type)}"></i>
            </div>
            <div class="notification-content">
                <div class="notification-title">${notification.title}</div>
                <div class="notification-message">${notification.message}</div>
                <div class="notification-meta">
                    ${new Date(notification.createdAt).toLocaleString()}
                    <span class="type-badge ${notification.type}">${notification.type}</span>
                    <span class="target-badge">${notification.target}</span>
                </div>
            </div>
            <div class="notification-actions">
                ${!notification.read ? `<button onclick="markAsRead(${index})" title="Mark as Read"><i class="fas fa-check"></i></button>` : ''}
                <button onclick="deleteNotification(${index})" title="Delete">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `).join('');
}

// Get notification icon based on type
function getNotificationIcon(type) {
    const icons = {
        'info': 'fa-info-circle',
        'success': 'fa-check-circle',
        'warning': 'fa-exclamation-triangle',
        'error': 'fa-times-circle'
    };
    return icons[type] || 'fa-bell';
}

// Open notification modal
function openNotificationModal() {
    document.getElementById('notification-modal').style.display = 'block';
    document.getElementById('notification-title').focus();
}

// Toggle notification form in dashboard
function toggleNotificationForm() {
    const formRow = document.querySelector('.notification-form-row');
    if (formRow) {
        formRow.classList.toggle('expanded');
    }
}

// Send notification from modal
function sendNotificationModal(event) {
    event.preventDefault();
    
    const email = document.getElementById('notificationEmailModal').value.trim();
    const icon = document.getElementById('notificationIconModal').value;
    const title = document.getElementById('notificationTitleModal').value.trim();
    const message = document.getElementById('notificationMessageModal').value.trim();
    
    if (!email || !title || !message) {
        showNotification('Please fill in all required fields', 'error');
        return;
    }
    
    // Here you would typically send the notification
    // For now, just show a success message
    showNotification(`Notification sent to ${email}`, 'success');
    
    // Reset form and close modal
    document.getElementById('notificationFormModal').reset();
    closeModal('notification-modal');
}

// Open delivery modal
function openDeliveryModal() {
    document.getElementById('delivery-modal').style.display = 'block';
    document.getElementById('deliveryOrderId').focus();
}

// Send delivery file
function sendDeliveryFile(event) {
    event.preventDefault();
    
    const orderId = document.getElementById('deliveryOrderId').value.trim();
    const email = document.getElementById('deliveryEmail').value.trim();
    const fileUrl = document.getElementById('deliveryFileUrl').value.trim();
    const files = document.getElementById('deliveryFiles').files;
    
    if (!orderId || !email) {
        showNotification('Please fill in Order ID and Email', 'error');
        return;
    }
    
    // Here you would typically send the delivery file
    // For now, just show a success message
    showNotification(`Delivery file sent for Order ${orderId} to ${email}`, 'success');
    
    // Reset form and close modal
    document.getElementById('deliveryForm').reset();
    document.getElementById('filesList').innerHTML = '';
    closeModal('delivery-modal');
}

// Save notification
function saveNotification() {
    const title = document.getElementById('notification-title').value.trim();
    const message = document.getElementById('notification-message').value.trim();
    const type = document.getElementById('notification-type').value;
    const target = document.getElementById('notification-target').value;

    if (!title || !message) {
        showNotification('Please enter both title and message', 'error');
        return;
    }

    const notifications = JSON.parse(localStorage.getItem('dashboard_notifications') || '[]');
    notifications.unshift({
        title,
        message,
        type,
        target,
        read: false,
        createdAt: new Date().toISOString()
    });

    localStorage.setItem('dashboard_notifications', JSON.stringify(notifications));
    renderNotifications(notifications);

    closeModal('notification-modal');
    document.getElementById('notification-title').value = '';
    document.getElementById('notification-message').value = '';

    showNotification('Notification sent successfully', 'success');
}

// Mark notification as read
function markAsRead(index) {
    const notifications = JSON.parse(localStorage.getItem('dashboard_notifications') || '[]');
    notifications[index].read = true;
    localStorage.setItem('dashboard_notifications', JSON.stringify(notifications));
    renderNotifications(notifications);
}

// Delete notification
function deleteNotification(index) {
    if (confirm('Are you sure you want to delete this notification?')) {
        const notifications = JSON.parse(localStorage.getItem('dashboard_notifications') || '[]');
        notifications.splice(index, 1);
        localStorage.setItem('dashboard_notifications', JSON.stringify(notifications));
        renderNotifications(notifications);
        showNotification('Notification deleted', 'success');
    }
}

// Close modals when clicking outside
window.onclick = function(event) {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    });
}

// Handle URL parameters for direct navigation
function handleUrlParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    const hash = window.location.hash.substring(1);

    // Handle folder navigation from hash
    if (hash) {
        navigateToFolder(hash);
    }

    // Handle file editing from query parameter
    const editFileParam = urlParams.get('edit');
    if (editFileParam) {
        // Wait for files to load, then edit the file
        setTimeout(() => {
            editFile(editFileParam, { stopPropagation: () => {} });
        }, 1000);
    }
};

// ========== PRODUCT MODAL FUNCTIONS ==========

// Open product modal
function openProductModal() {
    // Load categories from localStorage (sync with admin)
    loadDashboardCategories();
    
    // Reset form
    document.getElementById('dashboardProductForm').reset();
    
    // Set default tab
    switchProductTab('basic');
    switchProductLanguage('en');
    
    // Open modal
    document.getElementById('product-modal').style.display = 'block';
    document.getElementById('dashboardProductTitle').focus();

    // Default: set a random quantity so admins don't have to type it
    try {
        const qtyEl = document.getElementById('dashboardProductQuantity');
        if (qtyEl && !String(qtyEl.value || '').trim()) {
            qtyEl.value = String(getRandomStockQuantity());
        }
    } catch {}
}

// Open bulk products modal
function openBulkProductsModal() {
    // Keep categories synced (optional UX improvement)
    try { loadDashboardCategories(); } catch {}

    const status = document.getElementById('bulkProductsStatus');
    if (status) status.textContent = '';

    const input = document.getElementById('bulkProductsInput');
    if (input && !String(input.value || '').trim()) {
        // Provide a tiny starter template
        input.value = '[\n  {"title":"Sample Product","category":"Gadgets","price":9.99,"quantity":100,"image":"","note":"Short description"}\n]';
    }

    const format = document.getElementById('bulkProductsFormat');
    if (format && !String(format.value || '').trim()) format.value = 'json';

    document.getElementById('bulk-products-modal').style.display = 'block';
    try { input?.focus(); } catch {}
}

function setBulkStatus(message) {
    const el = document.getElementById('bulkProductsStatus');
    if (!el) return;
    el.textContent = message || '';
}

function parseNumber(value) {
    const n = typeof value === 'number' ? value : parseFloat(String(value || '').trim());
    return Number.isFinite(n) ? n : null;
}

function parseInteger(value) {
    const n = typeof value === 'number' ? value : parseInt(String(value || '').trim(), 10);
    return Number.isFinite(n) ? n : null;
}

function clampInt(n, min, max) {
    const nn = parseInteger(n);
    if (!Number.isFinite(nn)) return null;
    const a = Number.isFinite(min) ? min : nn;
    const b = Number.isFinite(max) ? max : nn;
    return Math.max(a, Math.min(b, nn));
}

function randomIntBetween(min, max) {
    const lo = Math.min(min, max);
    const hi = Math.max(min, max);
    return Math.floor(lo + Math.random() * (hi - lo + 1));
}

function splitCsvLine(line) {
    const out = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') {
                cur += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }
        if (ch === ',' && !inQuotes) {
            out.push(cur);
            cur = '';
            continue;
        }
        cur += ch;
    }
    out.push(cur);
    return out.map(s => String(s || '').trim());
}

function normalizeBulkProduct(raw, defaults, randomQtyCfg) {
    const errors = [];

    const title = String(raw?.title ?? raw?.name ?? '').trim();
    const category = String(raw?.category ?? defaults.defaultCategory ?? '').trim();
    const price = parseNumber(raw?.price);

    let quantity = parseInteger(raw?.quantity);
    const offerPrice = raw?.offerPrice != null && String(raw.offerPrice).trim() !== '' ? parseNumber(raw.offerPrice) : null;
    const image = String(raw?.image ?? defaults.defaultImage ?? '').trim();

    const note = String(raw?.note ?? raw?.description ?? '').trim();
    const title_en = String(raw?.title_en ?? '').trim();
    const note_en = String(raw?.note_en ?? '').trim();
    const title_ru = String(raw?.title_ru ?? '').trim();
    const note_ru = String(raw?.note_ru ?? '').trim();
    const title_zh = String(raw?.title_zh ?? '').trim();
    const note_zh = String(raw?.note_zh ?? '').trim();
    const title_ar = String(raw?.title_ar ?? '').trim();
    const note_ar = String(raw?.note_ar ?? '').trim();

    if (!title) errors.push('title is required');
    if (!category) errors.push('category is required (or set Default category)');
    if (!Number.isFinite(price) || price <= 0) errors.push('price must be a positive number');

    if (!Number.isFinite(quantity) || quantity <= 0) {
        if (randomQtyCfg.enabled) {
            const qMin = randomQtyCfg.min;
            const qMax = randomQtyCfg.max;
            if (Number.isFinite(qMin) && Number.isFinite(qMax) && qMin > 0 && qMax > 0) {
                quantity = randomIntBetween(qMin, qMax);
            } else {
                quantity = getRandomStockQuantity();
            }
        } else {
            errors.push('quantity must be a positive integer (or enable Random quantity)');
        }
    }

    const product = {
        title,
        category,
        price,
        quantity,
        offerPrice,
        image,
        note,
        title_en,
        note_en,
        title_ru,
        note_ru,
        title_zh,
        note_zh,
        title_ar,
        note_ar
    };

    // Remove null offerPrice so API doesn't get noisy
    if (product.offerPrice == null) delete product.offerPrice;

    return { product, errors };
}

function readBulkProductsFromInput() {
    const format = String(document.getElementById('bulkProductsFormat')?.value || 'json').toLowerCase();
    const text = String(document.getElementById('bulkProductsInput')?.value || '').trim();
    const defaultCategory = String(document.getElementById('bulkDefaultCategory')?.value || '').trim();
    const defaultImage = String(document.getElementById('bulkDefaultImage')?.value || '').trim();

    const randomEnabled = !!document.getElementById('bulkRandomQty')?.checked;
    const qMin = clampInt(document.getElementById('bulkQtyMin')?.value, 1, 1000000);
    const qMax = clampInt(document.getElementById('bulkQtyMax')?.value, 1, 1000000);

    const defaults = { defaultCategory, defaultImage };
    const randomQtyCfg = {
        enabled: randomEnabled,
        min: Number.isFinite(qMin) ? qMin : 50,
        max: Number.isFinite(qMax) ? qMax : 120
    };

    if (!text) throw new Error('Please paste products data.');

    let rows = [];
    if (format === 'json') {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) rows = parsed;
        else if (parsed && Array.isArray(parsed.products)) rows = parsed.products;
        else throw new Error('JSON must be an array, or an object with a "products" array.');
    } else if (format === 'csv') {
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        if (lines.length < 2) throw new Error('CSV must include a header line and at least one data row.');
        const headers = splitCsvLine(lines[0]).map(h => String(h || '').trim());
        rows = lines.slice(1).map(line => {
            const cols = splitCsvLine(line);
            const obj = {};
            headers.forEach((h, i) => {
                if (!h) return;
                obj[h] = cols[i] ?? '';
            });
            return obj;
        });
    } else {
        throw new Error('Unknown format. Use JSON or CSV.');
    }

    const normalized = [];
    const problems = [];
    rows.forEach((raw, idx) => {
        const { product, errors } = normalizeBulkProduct(raw, defaults, randomQtyCfg);
        if (errors.length) {
            problems.push(`Row ${idx + 1}: ${errors.join('; ')}`);
        } else {
            normalized.push(product);
        }
    });

    return { products: normalized, problems, totalRows: rows.length };
}

function validateBulkProducts() {
    try {
        const { products, problems, totalRows } = readBulkProductsFromInput();
        if (problems.length) {
            setBulkStatus(`Found ${problems.length} issue(s). First: ${problems[0]}`);
            return;
        }
        setBulkStatus(`Ready: ${products.length} product(s) validated (from ${totalRows} row(s)).`);
    } catch (e) {
        setBulkStatus(String(e?.message || e || 'Validation failed'));
    }
}

async function importBulkProducts() {
    let payload;
    try {
        payload = readBulkProductsFromInput();
    } catch (e) {
        setBulkStatus(String(e?.message || e || 'Import failed'));
        return;
    }

    const { products, problems, totalRows } = payload;
    if (problems.length) {
        setBulkStatus(`Fix issues first. Example: ${problems[0]}`);
        return;
    }
    if (!products.length) {
        setBulkStatus('No valid products to import.');
        return;
    }

    const token = localStorage.getItem('admin_auth_token');
    if (!token) {
        showNotification('You are not logged in. Please login again.', 'error');
        return;
    }

    const importBtn = document.querySelector('#bulk-products-modal .btn.btn-success');
    const validateBtn = document.querySelector('#bulk-products-modal .btn.btn-primary');
    if (importBtn) importBtn.disabled = true;
    if (validateBtn) validateBtn.disabled = true;

    let lastProductsSnapshot = null;
    try {
        setBulkStatus(`Importing 0/${products.length}...`);
        for (let i = 0; i < products.length; i++) {
            setBulkStatus(`Importing ${i + 1}/${products.length}...`);
            const res = await fetch(`${getApiBase()}/products`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(products[i])
            });

            const raw = await res.text();
            let data;
            try { data = raw ? JSON.parse(raw) : {}; }
            catch { data = { success: false, message: raw || `Request failed (${res.status})` }; }

            if (!res.ok || !data.success) {
                const name = products[i]?.title ? ` (${products[i].title})` : '';
                throw new Error(`Failed at item ${i + 1}${name}: ${data.message || 'Request failed'}`);
            }

            if (Array.isArray(data.products)) lastProductsSnapshot = data.products;
        }

        if (Array.isArray(lastProductsSnapshot)) {
            localStorage.setItem('admin_products_v1', JSON.stringify(lastProductsSnapshot));
        }

        showNotification(`Imported ${products.length} product(s) successfully!`, 'success');
        setBulkStatus(`Done: imported ${products.length} product(s) (from ${totalRows} row(s)).`);
    } catch (err) {
        console.error('importBulkProducts error:', err);
        showNotification('Bulk import failed', 'error');
        setBulkStatus(String(err?.message || err || 'Bulk import failed'));
    } finally {
        if (importBtn) importBtn.disabled = false;
        if (validateBtn) validateBtn.disabled = false;
    }
}

// Load categories for dashboard product modal
function loadDashboardCategories() {
    (async () => {
        let cats = [];
        try {
            const res = await fetch(`${getApiBase()}/categories`, { cache: 'no-store' });
            const data = await res.json();
            if (data && data.success && Array.isArray(data.categories)) {
                cats = data.categories;
            }
        } catch {}

        // Fallback to localStorage if API isn't available
        if (!Array.isArray(cats) || cats.length === 0) {
            try {
                cats = JSON.parse(localStorage.getItem('product_categories') || '[]');
            } catch {
                cats = [];
            }
        }

        if (!Array.isArray(cats) || cats.length === 0) {
            cats = ['Gmail', 'Facebook', 'Instagram', 'Twitter', 'LinkedIn', 'YouTube', 'TikTok', 'Telegram', 'WhatsApp', 'Other'];
        }

        const select = document.getElementById('dashboardProductCategory');
        if (!select) return;
        select.innerHTML = '<option value="">Select Category</option>' +
            cats.map(c => {
                const v = String(c);
                return `<option value="${v}">${v}</option>`;
            }).join('');
    })();
}

function getRandomStockQuantity() {
    // Keep it simple and consistent with marketplace restock patterns.
    const min = 50;
    const max = 120;
    return Math.floor(min + Math.random() * (max - min + 1));
}

// Switch product tabs
function switchProductTab(tabName) {
    // Hide all tabs
    document.getElementById('productBasicTab').style.display = 'none';
    document.getElementById('productLanguagesTab').style.display = 'none';
    document.getElementById('productMediaTab').style.display = 'none';
    
    // Remove active class from all tab nav items
    document.querySelectorAll('#product-modal .tab-nav-item').forEach(item => {
        item.classList.remove('active');
        item.style.borderBottomColor = 'transparent';
        item.style.color = '';
    });
    
    // Show selected tab and activate nav item
    document.getElementById('product' + tabName.charAt(0).toUpperCase() + tabName.slice(1) + 'Tab').style.display = 'block';
    
    // Find and activate the correct nav item
    const navItems = document.querySelectorAll('#product-modal .tab-nav-item');
    if (tabName === 'basic') navItems[0].classList.add('active');
    else if (tabName === 'languages') navItems[1].classList.add('active');
    else if (tabName === 'media') navItems[2].classList.add('active');
    
    // Style active nav item
    document.querySelector('#product-modal .tab-nav-item.active').style.borderBottomColor = '#3498db';
    document.querySelector('#product-modal .tab-nav-item.active').style.color = '#3498db';
}

// Switch product language tabs
function switchProductLanguage(lang) {
    // Hide all language content
    document.getElementById('productLangEn').style.display = 'none';
    document.getElementById('productLangRu').style.display = 'none';
    document.getElementById('productLangZh').style.display = 'none';
    document.getElementById('productLangAr').style.display = 'none';
    
    // Remove active class from all language tabs
    document.querySelectorAll('#product-modal .lang-tab').forEach(tab => {
        tab.classList.remove('active');
        tab.style.borderBottomColor = 'transparent';
        tab.style.color = '';
    });
    
    // Show selected language and activate tab
    document.getElementById('productLang' + lang.charAt(0).toUpperCase() + lang.slice(1)).style.display = 'block';
    
    // Find and activate the correct language tab
    const langTabs = document.querySelectorAll('#product-modal .lang-tab');
    if (lang === 'en') langTabs[0].classList.add('active');
    else if (lang === 'ru') langTabs[1].classList.add('active');
    else if (lang === 'zh') langTabs[2].classList.add('active');
    else if (lang === 'ar') langTabs[3].classList.add('active');
    
    // Style active language tab
    document.querySelector('#product-modal .lang-tab.active').style.borderBottomColor = '#3498db';
    document.querySelector('#product-modal .lang-tab.active').style.color = '#3498db';
}

// Save dashboard product
function saveDashboardProduct(event) {
    event.preventDefault();
    
    // Get form data
    const title = document.getElementById('dashboardProductTitle').value.trim();
    const category = document.getElementById('dashboardProductCategory').value;
    const price = parseFloat(document.getElementById('dashboardProductPrice').value);
    let quantity = parseInt(document.getElementById('dashboardProductQuantity').value);
    const offerPrice = document.getElementById('dashboardProductOfferPrice').value ? parseFloat(document.getElementById('dashboardProductOfferPrice').value) : null;
    const image = document.getElementById('dashboardProductImage').value.trim();
    
    // Multi-language data
    const titleEn = document.getElementById('dashboardTitleEn').value.trim();
    const noteEn = document.getElementById('dashboardNoteEn').value.trim();
    const titleRu = document.getElementById('dashboardTitleRu').value.trim();
    const noteRu = document.getElementById('dashboardNoteRu').value.trim();
    const titleZh = document.getElementById('dashboardTitleZh').value.trim();
    const noteZh = document.getElementById('dashboardNoteZh').value.trim();
    const titleAr = document.getElementById('dashboardTitleAr').value.trim();
    const noteAr = document.getElementById('dashboardNoteAr').value.trim();
    
    // Validation
    if (!title || !category || !price) {
        showNotification('Please fill in all required fields', 'error');
        return;
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
        quantity = getRandomStockQuantity();
    }
    
    // Create product object (server will assign id if missing)
    const product = {
        title,
        category,
        price,
        quantity,
        offerPrice,
        image,
        title_en: titleEn,
        note_en: noteEn,
        title_ru: titleRu,
        note_ru: noteRu,
        title_zh: titleZh,
        note_zh: noteZh,
        title_ar: titleAr,
        note_ar: noteAr
    };

    (async () => {
        try {
            const token = localStorage.getItem('admin_auth_token');
            if (!token) {
                showNotification('You are not logged in. Please login again.', 'error');
                return;
            }

            const res = await fetch(`${getApiBase()}/products`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(product)
            });

            const raw = await res.text();
            let data;
            try {
                data = raw ? JSON.parse(raw) : {};
            } catch {
                data = { success: false, message: raw || `Request failed (${res.status})` };
            }

            if (!res.ok || !data.success) {
                showNotification(data.message || 'Failed to add product', 'error');
                return;
            }

            // Keep local cache in sync for immediate UI consistency
            if (Array.isArray(data.products)) {
                localStorage.setItem('admin_products_v1', JSON.stringify(data.products));
            }

            closeModal('product-modal');
            showNotification('Product added successfully!', 'success');
        } catch (err) {
            console.error('saveDashboardProduct error:', err);
            showNotification('Failed to add product', 'error');
        }
    })();
    
    // Optional: Refresh products display if there's a products list on the dashboard
    // loadDashboardProducts();
}


// ========== CATEGORIES MANAGEMENT FUNCTIONS ==========

// ========== MARKETPLACE CATEGORY DETAILS MANAGER ==========

const CATEGORY_DETAILS_FILE_PATH = '/';
const CATEGORY_DETAILS_FILE_NAME = 'marketplace-category-details.json';
let __categoryDetailsOverrides = null;

// Keep a copy of the marketplace default content so the editor can show what's currently live
// even when no override exists yet.
const DEFAULT_CATEGORY_DETAILS_HTML = {
        all: `
                <h1>Buy Premium Accounts Online - Instant Delivery, Flexible Quantities, Trusted Support</h1>

                <p><strong>BuyPvaAccount</strong> offers a curated selection of accounts across popular services, including <strong>email platforms, social networks, and more</strong>. If you need accounts for testing, outreach, advertising workflows, or day-to-day operations, you can choose the category you want and order in the quantity that fits your project.</p>

                <h2>Why Buy From BuyPvaAccount?</h2>
                <ul>
                    <li><strong>Fast delivery</strong> - quick access after checkout.</li>
                    <li><strong>Bulk-friendly</strong> - buy one account or place a large order.</li>
                    <li><strong>Clear offers</strong> - straightforward listings with details and pricing.</li>
                    <li><strong>Support when needed</strong> - help with order questions and issues.</li>
                </ul>

                <h2>Fresh Stock and Category Variety</h2>
                <p>We regularly update availability and add new offers so you can find options that match your goals and preferred regions when applicable.</p>

                <h2>Wholesale Options</h2>
                <p>If you need accounts at scale for marketing teams, agencies, or internal testing, BuyPvaAccount supports bulk orders and repeat purchasing.</p>

                <h2>Order Now</h2>
                <p>Select a category to see available products, compare options, and place your order in minutes.</p>
        `,
        gmail: `
                <h1>Buy Gmail &amp; Google Accounts - Ready-to-Use Options for Workflows at Scale</h1>

                <p>Need <strong>Gmail/Google accounts</strong> for campaigns, verification flows, or operational tasks? BuyPvaAccount provides multiple options so you can choose what matches your use case and order size.</p>

                <h2>Common Options You Can Find</h2>
                <ul>
                    <li><strong>Verified accounts</strong> - prepared for immediate login.</li>
                    <li><strong>Aged accounts</strong> - older profiles suited for more natural activity patterns.</li>
                    <li><strong>Bulk-friendly packs</strong> - convenient for large campaigns and teams.</li>
                    <li><strong>Accounts with recovery details</strong> - for longer-term account management.</li>
                </ul>

                <h2>Why Order Here?</h2>
                <ul>
                    <li><strong>Fast delivery</strong> - access details after checkout.</li>
                    <li><strong>Choice</strong> - multiple listings for different needs.</li>
                    <li><strong>Support</strong> - help if you face order or access questions.</li>
                </ul>

                <h2>Get Started</h2>
                <p>Select a Gmail/Google offer from the list, choose quantity, and place your order. Delivery is provided with the credentials and basic usage information.</p>
        `,
        linkedin: `
                <h1>Buy LinkedIn Accounts in Bulk - Suitable for Outreach, Lead Gen, and B2B Work</h1>

                <p>If you run outreach, recruitment, or B2B campaigns, having the right account type matters. BuyPvaAccount lists different <strong>LinkedIn account options</strong> so you can choose by age, profile type, and quantity.</p>

                <h2>What You May See in This Category</h2>
                <ul>
                    <li><strong>Aged profiles</strong> - accounts with history intended for steadier usage.</li>
                    <li><strong>Region-focused accounts</strong> - options aligned to specific markets when offered.</li>
                    <li><strong>Bulk quantities</strong> - for teams and automated workflows.</li>
                </ul>

                <h2>Why Many Buyers Prefer Aged Profiles</h2>
                <p>Fresh profiles can be more sensitive in the early stage. Aged options are often selected for smoother onboarding and more natural-looking activity over time.</p>

                <h2>Delivery and Support</h2>
                <p>After checkout, you receive the account credentials and basic access guidance. If you have questions about your order, support is available.</p>
        `,
        email: `
                <h1>Buy Email Accounts - IMAP/POP3/SMTP Ready, Single or Bulk</h1>

                <p>BuyPvaAccount offers <strong>email account listings</strong> suitable for day-to-day communication, testing, and campaign tooling. Many offers support common protocols such as <strong>IMAP</strong>, <strong>POP3</strong>, and <strong>SMTP</strong>, so you can connect them to standard email clients and systems.</p>

                <h2>Typical Use Cases</h2>
                <ul>
                    <li><strong>Business operations</strong> - separate inboxes for teams and projects.</li>
                    <li><strong>Testing</strong> - QA, sign-up flows, and verification scenarios.</li>
                    <li><strong>Campaign workflows</strong> - bulk usage where permitted by your tools/platforms.</li>
                </ul>

                <h2>What to Expect</h2>
                <ul>
                    <li>Clear product options and quantities.</li>
                    <li>Fast delivery after checkout.</li>
                    <li>Credentials provided with basic access notes.</li>
                </ul>

                <h2>Choose an Offer and Order</h2>
                <p>Open the Email category, pick the product that fits your requirements, then select quantity and checkout.</p>
        `
};

function normalizeCategoryKey(value) {
    return String(value || '').trim().toLowerCase();
}

function canonicalCategoryDetailsKey(rawCategory) {
    const norm = normalizeCategoryKey(rawCategory);
    if (!norm) return '';
    if (norm === 'all') return 'all';

    const isGmail = norm === 'gmail' || norm.includes('gmail') || norm.includes('google');
    const isLinkedIn = norm === 'linkedin' || norm.includes('linkedin');
    const isEmail = norm === 'email' || norm.includes('email') || ['yahoo', 'outlook', 'proton', 'gmx', 'web', 'hotmail'].some(k => norm.includes(k));

    return isGmail ? 'gmail' : isLinkedIn ? 'linkedin' : isEmail ? 'email' : norm;
}

async function readDashboardFile(path, filename) {
    const response = await fetch(`/api/dashboard/files/read?path=${encodeURIComponent(path)}&file=${encodeURIComponent(filename)}`, {
        headers: getAuthHeaders()
    });
    const data = await response.json();
    return data;
}

async function saveDashboardFile(path, filename, content) {
    const response = await fetch('/api/dashboard/files/save', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders()
        },
        body: JSON.stringify({
            path,
            filename,
            content
        })
    });
    return response.json();
}

async function ensureDashboardFileExists(path, filename) {
    try {
        const existing = await readDashboardFile(path, filename);
        if (existing && existing.success) return true;
    } catch (e) {}

    try {
        const createRes = await fetch('/api/dashboard/files/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...getAuthHeaders()
            },
            body: JSON.stringify({
                path,
                name: filename,
                type: 'file'
            })
        });
        const createData = await createRes.json();
        if (!createData || !createData.success) {
            // If it already exists, it's fine.
        }
    } catch (e) {}

    // Write an initial JSON object
    try {
        const init = {
            _meta: {
                note: 'Overrides for marketplace category details box. Values must be HTML strings. Empty or missing values will use default marketplace content.',
                updatedAt: new Date().toISOString()
            }
        };
        await saveDashboardFile(path, filename, JSON.stringify(init, null, 2));
        return true;
    } catch (e) {
        return false;
    }
}

async function loadCategoryDetailsOverridesFromServer() {
    const ok = await ensureDashboardFileExists(CATEGORY_DETAILS_FILE_PATH, CATEGORY_DETAILS_FILE_NAME);
    if (!ok) return {};

    try {
        const data = await readDashboardFile(CATEGORY_DETAILS_FILE_PATH, CATEGORY_DETAILS_FILE_NAME);
        if (data && data.success && typeof data.content === 'string') {
            const parsed = JSON.parse(data.content);
            if (parsed && typeof parsed === 'object') return parsed;
        }
    } catch (e) {}
    return {};
}

function getDashboardCategoryNames() {
    try {
        const stored = JSON.parse(localStorage.getItem('product_categories') || '[]');
        if (Array.isArray(stored)) {
            return stored
                .map(c => (typeof c === 'string') ? c : (c && c.name))
                .filter(Boolean);
        }
    } catch (e) {}

    return ['Gmail', 'Facebook', 'Instagram', 'Twitter', 'LinkedIn', 'YouTube', 'TikTok', 'Telegram', 'WhatsApp', 'Other', 'Open phone'];
}

async function fetchCategoryNamesFromApi() {
    try {
        const res = await fetch('/api/categories');
        const data = await res.json();
        if (data && data.success && Array.isArray(data.categories)) {
            return data.categories
                .map(c => (typeof c === 'string') ? c : (c && (c.name || c.title || c.label)))
                .filter(Boolean);
        }
    } catch (e) {}
    return [];
}

async function getCategoryNamesForManager() {
    const fromLocal = getDashboardCategoryNames();
    if (Array.isArray(fromLocal) && fromLocal.length) return fromLocal;

    const fromApi = await fetchCategoryNamesFromApi();
    if (Array.isArray(fromApi) && fromApi.length) return fromApi;

    return ['Gmail', 'Facebook', 'Instagram', 'Twitter', 'LinkedIn', 'YouTube', 'TikTok', 'Telegram', 'WhatsApp', 'Other', 'Open phone'];
}

function setCategoryDetailsEditorValue(key) {
    const textarea = document.getElementById('cdm-html');
    const status = document.getElementById('cdm-status');
    if (!textarea || !status) return;

    const override = (__categoryDetailsOverrides && typeof __categoryDetailsOverrides[key] === 'string') ? __categoryDetailsOverrides[key] : '';
    const defaultHtml = (DEFAULT_CATEGORY_DETAILS_HTML && typeof DEFAULT_CATEGORY_DETAILS_HTML[key] === 'string') ? DEFAULT_CATEGORY_DETAILS_HTML[key] : '';

    if (override && override.trim()) {
        textarea.value = override;
        status.textContent = `Loaded saved override for "${key}".`;
        return;
    }

    if (defaultHtml && defaultHtml.trim()) {
        textarea.value = defaultHtml;
        status.textContent = `Loaded existing marketplace default content for "${key}". Click Save to create an override.`;
        return;
    }

    textarea.value = '';
    status.textContent = `No existing content for "${key}" yet. Add HTML and click Save.`;
}

async function openCategoryDetailsModal() {
    const modal = document.getElementById('category-details-manager-modal');
    const select = document.getElementById('cdm-category');
    const status = document.getElementById('cdm-status');
    if (!modal || !select) return;

    modal.style.display = 'block';
    if (status) status.textContent = 'Loading…';

    __categoryDetailsOverrides = await loadCategoryDetailsOverridesFromServer();

    const names = await getCategoryNamesForManager();
    const options = [];
    options.push({ label: 'ALL (Marketplace All)', value: 'all' });
    options.push({ label: 'GMAIL', value: 'gmail' });
    options.push({ label: 'LINKEDIN', value: 'linkedin' });
    options.push({ label: 'EMAIL', value: 'email' });

    names.forEach(n => {
        const key = canonicalCategoryDetailsKey(n);
        if (!key) return;
        if (['all', 'gmail', 'linkedin', 'email'].includes(key)) return;
        options.push({ label: String(n).toUpperCase(), value: key });
    });

    // De-dupe options by value
    const seen = new Set();
    const html = options
        .filter(o => {
            if (seen.has(o.value)) return false;
            seen.add(o.value);
            return true;
        })
        .map(o => `<option value="${o.value}">${o.label}</option>`)
        .join('');

    select.innerHTML = html;

    select.onchange = () => {
        const key = String(select.value || '');
        setCategoryDetailsEditorValue(key);
    };

    // Default selection
    select.value = 'all';
    setCategoryDetailsEditorValue('all');
}

async function saveCategoryDetailsOverride() {
    const select = document.getElementById('cdm-category');
    const textarea = document.getElementById('cdm-html');
    const status = document.getElementById('cdm-status');
    if (!select || !textarea) return;

    const key = String(select.value || '').trim();
    if (!key) {
        showNotification('Please select a category', 'error');
        return;
    }

    const html = String(textarea.value || '').trim();
    if (!__categoryDetailsOverrides || typeof __categoryDetailsOverrides !== 'object') {
        __categoryDetailsOverrides = {};
    }

    if (!html) {
        delete __categoryDetailsOverrides[key];
    } else {
        __categoryDetailsOverrides[key] = html;
    }

    // Keep meta updated
    const meta = (__categoryDetailsOverrides._meta && typeof __categoryDetailsOverrides._meta === 'object') ? __categoryDetailsOverrides._meta : {};
    __categoryDetailsOverrides._meta = {
        ...meta,
        updatedAt: new Date().toISOString()
    };

    const res = await saveDashboardFile(CATEGORY_DETAILS_FILE_PATH, CATEGORY_DETAILS_FILE_NAME, JSON.stringify(__categoryDetailsOverrides, null, 2));
    if (res && res.success) {
        showNotification('Category details saved', 'success');
        if (status) status.textContent = html ? `Saved override for "${key}".` : `Removed override for "${key}".`;
    } else {
        showNotification('Failed to save category details', 'error');
        if (status) status.textContent = (res && res.message) ? String(res.message) : 'Save failed.';
    }
}

async function deleteCategoryDetailsOverride() {
    const select = document.getElementById('cdm-category');
    const textarea = document.getElementById('cdm-html');
    if (!select || !textarea) return;

    const key = String(select.value || '').trim();
    if (!key) return;

    if (!confirm(`Delete override for "${key}"? The marketplace will fall back to default content.`)) {
        return;
    }

    if (!__categoryDetailsOverrides || typeof __categoryDetailsOverrides !== 'object') {
        __categoryDetailsOverrides = {};
    }

    delete __categoryDetailsOverrides[key];
    textarea.value = '';
    await saveCategoryDetailsOverride();
}

// Open category view modal
function openCategoryViewModal() {
    loadViewCategories();
    document.getElementById('category-view-modal').style.display = 'block';
}

// Open category edit modal
function openCategoryEditModal() {
    loadEditCategories();
    document.getElementById('category-edit-modal').style.display = 'block';
    document.getElementById('modalNewCategory').focus();
}

// Load categories for view modal
function loadViewCategories() {
    const cats = JSON.parse(localStorage.getItem('product_categories') || JSON.stringify(['Gmail', 'Facebook', 'Instagram', 'Twitter', 'LinkedIn', 'YouTube', 'TikTok', 'Telegram', 'WhatsApp', 'Other', 'Open phone']));
    const container = document.getElementById('viewCategoriesList');
    const countElement = document.getElementById('totalCategoriesCount');
    
    container.innerHTML = cats.map(cat => `
        <div style="display: flex; align-items: center; gap: 8px; padding: 12px 16px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
            <i class="fas fa-tag"></i>
            <span style="font-weight: 500;">${cat}</span>
        </div>
    `).join('');
    
    countElement.textContent = cats.length;
}

// Load categories for edit modal
function loadEditCategories() {
    const cats = JSON.parse(localStorage.getItem('product_categories') || JSON.stringify(['Gmail', 'Facebook', 'Instagram', 'Twitter', 'LinkedIn', 'YouTube', 'TikTok', 'Telegram', 'WhatsApp', 'Other', 'Open phone']));
    const container = document.getElementById('editCategoriesList');
    
    container.innerHTML = cats.map(cat => `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <div style="display: flex; align-items: center; gap: 8px;">
                <i class="fas fa-tag" style="color: #007bff;"></i>
                <span style="font-weight: 500; color: #2c3e50;">${cat}</span>
            </div>
            <button onclick="deleteDashboardCategory('${cat}')" 
                    style="background: none; border: none; color: #dc3545; cursor: pointer; padding: 4px 8px; border-radius: 4px; transition: all 0.2s;" 
                    title="Delete category"
                    onmouseover="this.style.backgroundColor='#f8d7da'"
                    onmouseout="this.style.backgroundColor='transparent'">
                <i class="fas fa-trash-alt"></i>
            </button>
        </div>
    `).join('');
}

// Add new category
function addDashboardCategory(event) {
    event.preventDefault();
    
    const categoryName = document.getElementById('modalNewCategory').value.trim();
    
    if (!categoryName) {
        showNotification('Please enter a category name', 'error');
        return;
    }
    
    // Get existing categories
    const cats = JSON.parse(localStorage.getItem('product_categories') || JSON.stringify(['Gmail', 'Facebook', 'Instagram', 'Twitter', 'LinkedIn', 'YouTube', 'TikTok', 'Telegram', 'WhatsApp', 'Other', 'Open phone']));
    
    // Check if category already exists
    if (cats.includes(categoryName)) {
        showNotification('Category already exists!', 'error');
        return;
    }
    
    // Add new category
    cats.push(categoryName);
    localStorage.setItem('product_categories', JSON.stringify(cats));
    
    // Clear input and reload categories
    document.getElementById('modalNewCategory').value = '';
    loadEditCategories();
    
    showNotification('Category added successfully!', 'success');
}

// Delete category
function deleteDashboardCategory(categoryName) {
    if (!confirm(`Are you sure you want to delete the "${categoryName}" category? This may affect existing products.`)) {
        return;
    }
    
    const cats = JSON.parse(localStorage.getItem('product_categories') || JSON.stringify(['Gmail', 'Facebook', 'Instagram', 'Twitter', 'LinkedIn', 'YouTube', 'TikTok', 'Telegram', 'WhatsApp', 'Other', 'Open phone']));
    
    // Don't allow deleting if only one category remains
    if (cats.length <= 1) {
        showNotification('Cannot delete the last category!', 'error');
        return;
    }
    
    // Remove category
    const updatedCats = cats.filter(cat => cat !== categoryName);
    localStorage.setItem('product_categories', JSON.stringify(updatedCats));
    
    // Reload categories in edit modal
    loadEditCategories();
    
    showNotification('Category deleted successfully!', 'success');
}

// ========== INVENTORY MANAGEMENT FUNCTIONS ==========

// Open inventory view modal
function openInventoryViewModal() {
    loadInventoryView();
    document.getElementById('inventory-view-modal').style.display = 'block';
}

// Open inventory update modal
function openInventoryUpdateModal() {
    loadInventoryUpdate();
    document.getElementById('inventory-update-modal').style.display = 'block';
}

// Load inventory view
function loadInventoryView() {
    const products = JSON.parse(localStorage.getItem('admin_products_v1') || '[]');
    const container = document.getElementById('inventoryList');
    
    console.log('Loading inventory view with products:', products);
    
    if (products.length === 0) {
        // Try to initialize products if none exist
        initializeProducts().then(() => {
            const updatedProducts = JSON.parse(localStorage.getItem('admin_products_v1') || '[]');
            renderInventoryView(updatedProducts);
        });
        return;
    }
    
    renderInventoryView(products);
}

function renderInventoryView(products) {
    const container = document.getElementById('inventoryList');
    
    let totalProducts = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;
    
    if (products.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #666;">
                <i class="fas fa-box-open" style="font-size: 48px; margin-bottom: 16px;"></i>
                <h4>No Products Found</h4>
                <p>Add some products first to view inventory</p>
            </div>
        `;
    } else {
        container.innerHTML = products.map(product => {
            totalProducts++;
            const isLowStock = product.quantity <= 5 && product.quantity > 0;
            const isOutOfStock = product.quantity <= 0;
            
            if (isLowStock) lowStockCount++;
            if (isOutOfStock) outOfStockCount++;
            
            const stockStatus = isOutOfStock ? 'out-of-stock' : isLowStock ? 'low-stock' : 'in-stock';
            const statusColor = isOutOfStock ? '#dc3545' : isLowStock ? '#fd7e14' : '#28a745';
            const statusText = isOutOfStock ? 'Out of Stock' : isLowStock ? 'Low Stock' : 'In Stock';
            
            return `
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 16px; margin-bottom: 12px; background: white; border: 1px solid #e9ecef; border-radius: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                    <div style="display: flex; align-items: center; gap: 16px;">
                        <div style="width: 50px; height: 50px; background: #f8f9fa; border-radius: 8px; display: flex; align-items: center; justify-content: center;">
                            <i class="fas fa-box" style="color: #6c757d;"></i>
                        </div>
                        <div>
                            <h5 style="margin: 0 0 4px 0; font-size: 16px; font-weight: 600; color: #2c3e50;">${product.title}</h5>
                            <p style="margin: 0; font-size: 14px; color: #6c757d;">${product.category}</p>
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 24px; font-weight: bold; color: #2c3e50; margin-bottom: 4px;">${product.quantity}</div>
                        <div style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 8px; background: ${statusColor}20; color: ${statusColor}; border-radius: 12px; font-size: 12px; font-weight: 500;">
                            <i class="fas fa-circle" style="font-size: 8px;"></i>
                            ${statusText}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }
    
    // Update summary counts
    document.getElementById('totalProductsCount').textContent = totalProducts;
    document.getElementById('lowStockCount').textContent = lowStockCount;
    document.getElementById('outOfStockCount').textContent = outOfStockCount;
}

// Load inventory update view
function loadInventoryUpdate() {
    const products = JSON.parse(localStorage.getItem('admin_products_v1') || '[]');
    const container = document.getElementById('inventoryUpdateList');
    
    if (products.length === 0) {
        // Try to initialize products if none exist
        initializeProducts().then(() => {
            const updatedProducts = JSON.parse(localStorage.getItem('admin_products_v1') || '[]');
            renderInventoryUpdate(updatedProducts);
            setupInventorySearch(updatedProducts);
        });
        return;
    }
    
    renderInventoryUpdate(products);
    setupInventorySearch(products);
}

// Setup search functionality for inventory
function setupInventorySearch(products) {
    const searchInput = document.getElementById('inventorySearch');
    if (searchInput) {
        // Remove existing event listeners to avoid duplicates
        const newSearchInput = searchInput.cloneNode(true);
        searchInput.parentNode.replaceChild(newSearchInput, searchInput);
        
        newSearchInput.addEventListener('input', function() {
            renderInventoryUpdate(products, this.value);
        });
        
        // Clear search on modal open
        newSearchInput.value = '';
        newSearchInput.focus();
    }
}

function renderInventoryUpdate(products, searchTerm = '') {
    const container = document.getElementById('inventoryUpdateList');
    
    // Filter products based on search term
    let filteredProducts = products;
    if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase().trim();
        filteredProducts = products.filter(product => 
            product.title.toLowerCase().includes(term) || 
            (product.category && product.category.toLowerCase().includes(term))
        );
    }
    
    if (filteredProducts.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #666;">
                <i class="fas fa-search" style="font-size: 48px; margin-bottom: 16px;"></i>
                <h4>No Products Found</h4>
                <p>${searchTerm.trim() ? `No products match "${searchTerm}". Try a different search term.` : 'Add some products first to manage inventory'}</p>
            </div>
        `;
    } else {
        container.innerHTML = filteredProducts.map((product, filteredIndex) => {
            // Find the original index in the full products array
            const originalIndex = products.findIndex(p => p.id === product.id);
            return `
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 16px; margin-bottom: 12px; background: white; border: 1px solid #e9ecef; border-radius: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);" data-product-id="${product.id}">
                <div style="display: flex; align-items: center; gap: 16px;">
                    <div style="width: 50px; height: 50px; background: #f8f9fa; border-radius: 8px; display: flex; align-items: center; justify-content: center;">
                        <i class="fas fa-box" style="color: #6c757d;"></i>
                    </div>
                    <div>
                        <h5 style="margin: 0 0 4px 0; font-size: 16px; font-weight: 600; color: #2c3e50;">${product.title}</h5>
                        <p style="margin: 0; font-size: 14px; color: #6c757d;">${product.category || 'N/A'}</p>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="display: flex; align-items: center; gap: 8px; background: #f8f9fa; border-radius: 8px; padding: 8px;">
                        <button onclick="adjustQuantity(${originalIndex}, -1)" style="background: #dc3545; color: white; border: none; width: 30px; height: 30px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center;">
                            <i class="fas fa-minus"></i>
                        </button>
                        <input type="number" value="${product.quantity}" min="0" 
                               onchange="updateQuantity(${originalIndex}, this.value)" 
                               style="width: 80px; text-align: center; border: 1px solid #ddd; border-radius: 4px; padding: 4px; font-weight: bold;">
                        <button onclick="adjustQuantity(${originalIndex}, 1)" style="background: #28a745; color: white; border: none; width: 30px; height: 30px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center;">
                            <i class="fas fa-plus"></i>
                        </button>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px; background: #e8f4fd; border-radius: 8px; padding: 8px;">
                        <input type="number" id="custom-qty-${originalIndex}" placeholder="Amount" min="1" 
                               style="width: 70px; text-align: center; border: 1px solid #ddd; border-radius: 4px; padding: 4px; font-size: 12px;">
                        <button onclick="adjustQuantityCustom(${originalIndex}, 'subtract')" style="background: #dc3545; color: white; border: none; width: 24px; height: 24px; border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 12px;">
                            <i class="fas fa-minus"></i>
                        </button>
                        <button onclick="adjustQuantityCustom(${originalIndex}, 'add')" style="background: #28a745; color: white; border: none; width: 24px; height: 24px; border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 12px;">
                            <i class="fas fa-plus"></i>
                        </button>
                    </div>
                    <div style="font-size: 18px; font-weight: bold; color: #2c3e50; min-width: 40px; text-align: center;" id="quantity-${originalIndex}">
                        ${product.quantity}
                    </div>
                </div>
            </div>
        `}).join('');
    }
}

// Adjust quantity by amount (+1 or -1)
function adjustQuantity(productIndex, amount) {
    const products = JSON.parse(localStorage.getItem('admin_products_v1') || '[]');
    if (productIndex >= 0 && productIndex < products.length) {
        const newQuantity = Math.max(0, products[productIndex].quantity + amount);
        products[productIndex].quantity = newQuantity;
        
        // Update localStorage
        localStorage.setItem('admin_products_v1', JSON.stringify(products));
        
        // Update backend
        updateProductInBackend(products[productIndex]);
        
        // Update display
        document.getElementById(`quantity-${productIndex}`).textContent = newQuantity;
        document.querySelector(`[data-product-id="${products[productIndex].id}"] input`).value = newQuantity;
        
        showNotification(`Quantity ${amount > 0 ? 'increased' : 'decreased'} by ${Math.abs(amount)}`, 'success');
    }
}

// Adjust quantity by custom amount
function adjustQuantityCustom(productIndex, operation) {
    const customQtyInput = document.getElementById(`custom-qty-${productIndex}`);
    const customAmount = parseInt(customQtyInput.value) || 0;

    if (customAmount <= 0) {
        showNotification('Please enter a valid amount greater than 0', 'warning');
        return;
    }

    const products = JSON.parse(localStorage.getItem('admin_products_v1') || '[]');
    if (productIndex >= 0 && productIndex < products.length) {
        const amount = operation === 'add' ? customAmount : -customAmount;
        const newQuantity = Math.max(0, products[productIndex].quantity + amount);
        products[productIndex].quantity = newQuantity;

        // Update localStorage
        localStorage.setItem('admin_products_v1', JSON.stringify(products));

        // Update backend
        updateProductInBackend(products[productIndex]);

        // Update display
        document.getElementById(`quantity-${productIndex}`).textContent = newQuantity;
        document.querySelector(`[data-product-id="${products[productIndex].id}"] input`).value = newQuantity;

        showNotification(`Quantity ${operation === 'add' ? 'increased' : 'decreased'} by ${customAmount}`, 'success');

        // Clear the custom input after use
        customQtyInput.value = '';
    }
}

// Update quantity directly
function updateQuantity(productIndex, newValue) {
    const quantity = parseInt(newValue) || 0;
    const products = JSON.parse(localStorage.getItem('admin_products_v1') || '[]');
    
    if (productIndex >= 0 && productIndex < products.length) {
        products[productIndex].quantity = Math.max(0, quantity);
        
        // Update localStorage
        localStorage.setItem('admin_products_v1', JSON.stringify(products));
        
        // Update backend
        updateProductInBackend(products[productIndex]);
        
        // Update display
        document.getElementById(`quantity-${productIndex}`).textContent = products[productIndex].quantity;
        
        showNotification('Quantity updated', 'success');
    }
}

// Update product in backend
async function updateProductInBackend(product) {
    try {
        const response = await fetch(`/api/products/${product.id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                ...getAuthHeaders()
            },
            body: JSON.stringify(product)
        });
        
        const data = await response.json();
        if (data.success) {
            console.log('Product updated in backend:', product.id);
        } else {
            console.warn('Failed to update product in backend:', data.message);
        }
    } catch (error) {
        console.error('Error updating product in backend:', error);
    }
}

// Sync all products with backend (bulk update)
async function syncAllProductsWithBackend() {
    try {
        const products = JSON.parse(localStorage.getItem('admin_products_v1') || '[]');
        if (products.length === 0) {
            console.log('No products to sync');
            return;
        }

        // Validate products array
        if (!Array.isArray(products)) {
            throw new Error('Products data is not an array');
        }

        // Validate each product has required fields
        const validProducts = products.filter(p => p && p.id && p.title);
        if (validProducts.length !== products.length) {
            console.warn('Some products missing required fields, syncing only valid ones');
        }

        console.log('Syncing products with backend:', validProducts.length, 'valid products');

        const authHeaders = getAuthHeaders();
        if (!authHeaders || !authHeaders.Authorization) {
            throw new Error('Admin authentication required to sync products');
        }

        const response = await fetch('/api/products', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
                , ...authHeaders
            },
            body: JSON.stringify(validProducts)
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        console.log('Backend response:', data);

        if (data.success) {
            console.log('All products synced with backend successfully');
            // Refresh localStorage with backend data to ensure consistency
            checkForProductUpdates();
            showNotification('All inventory changes synced with admin panel!', 'success');
        } else {
            console.warn('Failed to sync products with backend:', data.message);
            showNotification('Failed to sync with admin panel: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('Error syncing products with backend:', error);
        showNotification('Error syncing with admin panel: ' + error.message, 'error');
    }
}

// Check for product updates from other sources (admin panel, etc.)
async function checkForProductUpdates() {
    try {
        const response = await fetch('/api/products');
        const data = await response.json();
        if (data.success && Array.isArray(data.products)) {
            const currentLocal = localStorage.getItem('admin_products_v1');
            const apiProductsStr = JSON.stringify(data.products);
            
            if (currentLocal !== apiProductsStr) {
                console.log('Products updated from external source, syncing localStorage...');
                localStorage.setItem('admin_products_v1', apiProductsStr);
                
                // If inventory modal is open, refresh it
                const inventoryModal = document.getElementById('inventory-view-modal');
                const updateModal = document.getElementById('inventory-update-modal');
                if (inventoryModal.style.display === 'block') {
                    loadInventoryView();
                }
                if (updateModal.style.display === 'block') {
                    loadInventoryUpdate();
                }
            }
        }
    } catch (error) {
        console.error('Error checking for product updates:', error);
    }
}

// Save all inventory changes (optional - changes are already saved in real-time)
function saveInventoryChanges() {
    // Sync all products with backend to ensure consistency with admin.html
    syncAllProductsWithBackend();
    showNotification('All inventory changes saved and synced with admin panel!', 'success');
    closeModal('inventory-update-modal');
}

// Open Product Analytics Modal
function openProductAnalyticsModal() {
    const modal = document.getElementById('analytics-modal');
    if (!modal) {
        createAnalyticsModal();
    }
    loadProductAnalytics();
    document.getElementById('analytics-modal').style.display = 'block';
}

// Create Analytics Modal
function createAnalyticsModal() {
    const modal = document.createElement('div');
    modal.id = 'analytics-modal';
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 1000px; width: 95%;">
            <div class="modal-header">
                <h3><i class="fas fa-chart-line"></i> Product Analytics Dashboard</h3>
                <span class="close" onclick="closeModal('analytics-modal')">×</span>
            </div>
            <div class="modal-body">
                <div id="analytics-content">
                    <div class="analytics-loading">
                        <div class="spinner"></div>
                        <p>Loading analytics data...</p>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" onclick="closeModal('analytics-modal')">Close</button>
                <button type="button" class="btn btn-primary" onclick="refreshAnalytics()">
                    <i class="fas fa-sync"></i> Refresh Data
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

// Load Product Analytics
async function loadProductAnalytics() {
    const container = document.getElementById('analytics-content');

    try {
        // Get products data
        const products = JSON.parse(localStorage.getItem('admin_products_v1') || '[]');

        // Try to get orders from API first, fallback to localStorage
        let orders = [];
        try {
            const response = await fetch('/api/admin/orders', {
                headers: getAuthHeaders()
            });
            const data = await response.json();
            if (data.success) {
                orders = data.orders;
            }
        } catch (apiError) {
            console.warn('API not available for orders, using localStorage');
            orders = JSON.parse(localStorage.getItem('orders') || '[]');
        }

        // Get additional data sources
        const supportTickets = JSON.parse(localStorage.getItem('support_tickets') || '[]');
        const accountRequests = JSON.parse(localStorage.getItem('account_requests') || '[]');

        // Calculate comprehensive analytics
        const analytics = calculateComprehensiveAnalytics(products, orders, supportTickets, accountRequests);

        container.innerHTML = `
            <div class="analytics-dashboard">
                <!-- Summary Cards -->
                <div class="analytics-summary">
                    <div class="summary-card">
                        <div class="summary-icon" style="color: #3498db;">
                            <i class="fas fa-shopping-cart"></i>
                        </div>
                        <div class="summary-content">
                            <h4>Total Orders</h4>
                            <p class="summary-value">${analytics.totalOrders}</p>
                        </div>
                    </div>
                    <div class="summary-card">
                        <div class="summary-icon" style="color: #2ecc71;">
                            <i class="fas fa-dollar-sign"></i>
                        </div>
                        <div class="summary-content">
                            <h4>Total Revenue</h4>
                            <p class="summary-value">$${analytics.totalRevenue.toFixed(2)}</p>
                        </div>
                    </div>
                    <div class="summary-card">
                        <div class="summary-icon" style="color: #e74c3c;">
                            <i class="fas fa-boxes"></i>
                        </div>
                        <div class="summary-content">
                            <h4>Low Stock Items</h4>
                            <p class="summary-value">${analytics.lowStockCount}</p>
                        </div>
                    </div>
                    <div class="summary-card">
                        <div class="summary-icon" style="color: #f39c12;">
                            <i class="fas fa-fire"></i>
                        </div>
                        <div class="summary-content">
                            <h4>Best Seller</h4>
                            <p class="summary-value">${analytics.bestSeller || 'N/A'}</p>
                        </div>
                    </div>
                    <div class="summary-card">
                        <div class="summary-icon" style="color: #9b59b6;">
                            <i class="fas fa-headset"></i>
                        </div>
                        <div class="summary-content">
                            <h4>Support Tickets</h4>
                            <p class="summary-value">${analytics.supportStats.totalTickets}</p>
                        </div>
                    </div>
                    <div class="summary-card">
                        <div class="summary-icon" style="color: #1abc9c;">
                            <i class="fas fa-users"></i>
                        </div>
                        <div class="summary-content">
                            <h4>Customer Requests</h4>
                            <p class="summary-value">${analytics.requestStats.totalRequests}</p>
                        </div>
                    </div>
                    <div class="summary-card">
                        <div class="summary-icon" style="color: #e67e22;">
                            <i class="fas fa-clock"></i>
                        </div>
                        <div class="summary-content">
                            <h4>Open Orders</h4>
                            <p class="summary-value">${analytics.orderStatusStats.pending + analytics.orderStatusStats.confirmed + analytics.orderStatusStats.processing}</p>
                        </div>
                    </div>
                    <div class="summary-card">
                        <div class="summary-icon" style="color: #34495e;">
                            <i class="fas fa-check-circle"></i>
                        </div>
                        <div class="summary-content">
                            <h4>Completed Orders</h4>
                            <p class="summary-value">${analytics.orderStatusStats.completed}</p>
                        </div>
                    </div>
                </div>

                <!-- Top Performing Products -->
                <div class="analytics-section">
                    <h4><i class="fas fa-trophy"></i> Top Performing Products</h4>
                    <div class="analytics-table">
                        ${analytics.topProducts.length > 0 ? `
                        <table>
                            <thead>
                                <tr>
                                    <th>Product</th>
                                    <th>Category</th>
                                    <th>Orders</th>
                                    <th>Revenue</th>
                                    <th>Stock</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody id="top-products-table">
                                ${analytics.topProducts.map(product => `
                                    <tr>
                                        <td>${product.title}</td>
                                        <td>${product.category || 'N/A'}</td>
                                        <td>${product.orders}</td>
                                        <td>$${product.revenue.toFixed(2)}</td>
                                        <td>${product.quantity}</td>
                                        <td>
                                            <span class="status-badge ${product.statusClass}">
                                                ${product.status}
                                            </span>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                        ` : `
                        <div class="no-data-message">
                            <i class="fas fa-chart-line"></i>
                            <h5>No Sales Data Yet</h5>
                            <p>Start making sales to see product performance analytics here.</p>
                        </div>
                        `}
                    </div>
                </div>

                <!-- Category Performance -->
                <div class="analytics-section">
                    <h4><i class="fas fa-tags"></i> Category Performance</h4>
                    ${analytics.categoryStats.length > 0 ? `
                    <div class="category-performance">
                        ${analytics.categoryStats.map(cat => `
                            <div class="category-item">
                                <div class="category-name">${cat.name}</div>
                                <div class="category-bar">
                                    <div class="bar-fill" style="width: ${cat.percentage}%"></div>
                                </div>
                                <div class="category-stats">${cat.orders} orders</div>
                            </div>
                        `).join('')}
                    </div>
                    ` : `
                    <div class="no-data-message">
                        <i class="fas fa-tags"></i>
                        <h5>No Category Data</h5>
                        <p>Category performance will appear here once sales data is available.</p>
                    </div>
                    `}
                </div>

                <!-- Low Stock Alert -->
                <div class="analytics-section">
                    <h4><i class="fas fa-exclamation-triangle"></i> Low Stock Alert</h4>
                    <div class="low-stock-list">
                        ${analytics.lowStockProducts.length > 0 ?
                            analytics.lowStockProducts.map(product => `
                                <div class="low-stock-item">
                                    <div class="product-info">
                                        <strong>${product.title}</strong>
                                        <span>${product.category || 'N/A'}</span>
                                    </div>
                                    <div class="stock-info">
                                        <span class="stock-count ${product.quantity === 0 ? 'out-of-stock' : 'low-stock'}">
                                            ${product.quantity === 0 ? 'Out of Stock' : `${product.quantity} left`}
                                        </span>
                                    </div>
                                </div>
                            `).join('') :
                            '<p class="no-alerts">All products are well-stocked! 🎉</p>'
                        }
                    </div>
                </div>

                <!-- Order Status Analytics -->
                <div class="analytics-section">
                    <h4><i class="fas fa-tasks"></i> Order Status Overview</h4>
                    <div class="order-status-grid">
                        ${Object.entries(analytics.orderStatusStats).map(([status, count]) => `
                            <div class="status-card status-${status}">
                                <div class="status-icon">
                                    <i class="fas ${getStatusIcon(status)}"></i>
                                </div>
                                <div class="status-info">
                                    <h5>${status.charAt(0).toUpperCase() + status.slice(1)}</h5>
                                    <p class="status-count">${count}</p>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <!-- Support Ticket Analytics -->
                <div class="analytics-section">
                    <h4><i class="fas fa-headset"></i> Support Analytics</h4>
                    <div class="support-analytics-grid">
                        <div class="support-metric">
                            <div class="metric-icon" style="color: #3498db;">
                                <i class="fas fa-ticket-alt"></i>
                            </div>
                            <div class="metric-content">
                                <h5>Total Tickets</h5>
                                <p class="metric-value">${analytics.supportStats.totalTickets}</p>
                            </div>
                        </div>
                        <div class="support-metric">
                            <div class="metric-icon" style="color: #f39c12;">
                                <i class="fas fa-clock"></i>
                            </div>
                            <div class="metric-content">
                                <h5>Open Tickets</h5>
                                <p class="metric-value">${analytics.supportStats.openTickets}</p>
                            </div>
                        </div>
                        <div class="support-metric">
                            <div class="metric-icon" style="color: #2ecc71;">
                                <i class="fas fa-check-circle"></i>
                            </div>
                            <div class="metric-content">
                                <h5>Resolved</h5>
                                <p class="metric-value">${analytics.supportStats.resolvedTickets}</p>
                            </div>
                        </div>
                        <div class="support-metric">
                            <div class="metric-icon" style="color: #e74c3c;">
                                <i class="fas fa-exclamation-triangle"></i>
                            </div>
                            <div class="metric-content">
                                <h5>Urgent</h5>
                                <p class="metric-value">${analytics.supportStats.urgentTickets}</p>
                            </div>
                        </div>
                    </div>

                    ${analytics.supportStats.avgResolutionTime > 0 ? `
                    <div class="resolution-time">
                        <h5>Average Resolution Time</h5>
                        <p class="resolution-value">${analytics.supportStats.avgResolutionTime.toFixed(1)} hours</p>
                    </div>
                    ` : ''}

                    ${Object.keys(analytics.supportStats.ticketCategories).length > 0 ? `
                    <div class="ticket-categories">
                        <h5>Ticket Categories</h5>
                        <div class="category-tags">
                            ${Object.entries(analytics.supportStats.ticketCategories)
                                .sort(([,a], [,b]) => b - a)
                                .slice(0, 8)
                                .map(([category, count]) => `
                                <span class="category-tag">
                                    ${category} <span class="tag-count">(${count})</span>
                                </span>
                            `).join('')}
                        </div>
                    </div>
                    ` : ''}
                </div>

                <!-- Customer Request Analytics -->
                <div class="analytics-section">
                    <h4><i class="fas fa-users"></i> Customer Requests</h4>
                    <div class="request-analytics-grid">
                        <div class="request-metric">
                            <div class="metric-icon" style="color: #9b59b6;">
                                <i class="fas fa-envelope"></i>
                            </div>
                            <div class="metric-content">
                                <h5>Total Requests</h5>
                                <p class="metric-value">${analytics.requestStats.totalRequests}</p>
                            </div>
                        </div>
                        <div class="request-metric">
                            <div class="metric-icon" style="color: #f39c12;">
                                <i class="fas fa-hourglass-half"></i>
                            </div>
                            <div class="metric-content">
                                <h5>Pending</h5>
                                <p class="metric-value">${analytics.requestStats.pendingRequests}</p>
                            </div>
                        </div>
                        <div class="request-metric">
                            <div class="metric-icon" style="color: #2ecc71;">
                                <i class="fas fa-check"></i>
                            </div>
                            <div class="metric-content">
                                <h5>Resolved</h5>
                                <p class="metric-value">${analytics.requestStats.resolvedRequests}</p>
                            </div>
                        </div>
                    </div>

                    ${Object.keys(analytics.requestStats.commonIssues).length > 0 ? `
                    <div class="common-issues">
                        <h5>Common Issues</h5>
                        <div class="issue-list">
                            ${Object.entries(analytics.requestStats.commonIssues)
                                .sort(([,a], [,b]) => b - a)
                                .slice(0, 6)
                                .map(([issue, count]) => `
                                <div class="issue-item">
                                    <span class="issue-name">${issue}</span>
                                    <span class="issue-count">${count}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    ` : ''}
                </div>
            </div>
        `;

        // Add CSS styles
        addAnalyticsStyles();

    } catch (error) {
        console.error('Error loading analytics:', error);
        container.innerHTML = `
            <div class="error-message">
                <i class="fas fa-exclamation-circle"></i>
                <h4>Error Loading Analytics</h4>
                <p>Please try again later.</p>
                <button onclick="loadProductAnalytics()" class="btn btn-primary">Retry</button>
            </div>
        `;
    }
}

// Calculate Comprehensive Analytics
function calculateComprehensiveAnalytics(products, orders, supportTickets, accountRequests) {
    const analytics = {
        totalOrders: 0,
        totalRevenue: 0,
        lowStockCount: 0,
        bestSeller: null,
        topProducts: [],
        categoryStats: [],
        lowStockProducts: [],
        // Order status analytics
        orderStatusStats: {
            pending: 0,
            confirmed: 0,
            completed: 0,
            processing: 0,
            hold: 0,
            cancelled: 0,
            refunded: 0
        },
        // Support analytics
        supportStats: {
            totalTickets: 0,
            openTickets: 0,
            resolvedTickets: 0,
            avgResolutionTime: 0,
            ticketCategories: {},
            urgentTickets: 0
        },
        // Customer request analytics
        requestStats: {
            totalRequests: 0,
            pendingRequests: 0,
            resolvedRequests: 0,
            commonIssues: {},
            requestTrends: []
        }
    };

    // Create product sales map
    const productSales = {};

    // Initialize products
    products.forEach(product => {
        productSales[product.id] = {
            ...product,
            orders: 0,
            revenue: 0
        };
    });

    // Calculate sales from orders
    orders.forEach(order => {
        if (order.items) {
            order.items.forEach(item => {
                const product = productSales[item.id];
                if (product) {
                    product.orders += item.quantity;
                    product.revenue += item.unitPrice * item.quantity;
                    analytics.totalOrders += item.quantity;
                    analytics.totalRevenue += item.unitPrice * item.quantity;
                }
            });
        }
    });

    // Convert to array and sort by orders
    const productsWithSales = Object.values(productSales);
    productsWithSales.sort((a, b) => b.orders - a.orders);

    // Get top products
    analytics.topProducts = productsWithSales.slice(0, 10).map(product => ({
        ...product,
        status: product.quantity === 0 ? 'Out of Stock' :
                product.quantity <= 10 ? 'Low Stock' : 'In Stock',
        statusClass: product.quantity === 0 ? 'status-out' :
                    product.quantity <= 10 ? 'status-low' : 'status-in'
    }));

    // Find best seller
    if (productsWithSales.length > 0 && productsWithSales[0].orders > 0) {
        analytics.bestSeller = productsWithSales[0].title;
    } else if (productsWithSales.length > 0) {
        analytics.bestSeller = 'No sales yet';
    }

    // Calculate category stats
    const categoryMap = {};
    productsWithSales.forEach(product => {
        const category = product.category || 'Uncategorized';
        if (!categoryMap[category]) {
            categoryMap[category] = { name: category, orders: 0 };
        }
        categoryMap[category].orders += product.orders;
    });

    const categories = Object.values(categoryMap);
    const maxOrders = Math.max(...categories.map(c => c.orders));
    analytics.categoryStats = categories.map(cat => ({
        ...cat,
        percentage: maxOrders > 0 ? (cat.orders / maxOrders) * 100 : 0
    })).sort((a, b) => b.orders - a.orders);

    // Find low stock products
    analytics.lowStockProducts = productsWithSales.filter(product =>
        product.quantity <= 10
    ).sort((a, b) => a.quantity - b.quantity);

    analytics.lowStockCount = analytics.lowStockProducts.length;

    // Calculate order status analytics
    orders.forEach(order => {
        const status = (order.status || 'pending').toLowerCase();
        if (analytics.orderStatusStats.hasOwnProperty(status)) {
            analytics.orderStatusStats[status]++;
        }
    });

    // Calculate support ticket analytics
    analytics.supportStats.totalTickets = supportTickets.length;
    analytics.supportStats.openTickets = supportTickets.filter(ticket =>
        ticket.status !== 'resolved' && ticket.status !== 'closed'
    ).length;
    analytics.supportStats.resolvedTickets = supportTickets.filter(ticket =>
        ticket.status === 'resolved' || ticket.status === 'closed'
    ).length;

    // Calculate ticket categories
    supportTickets.forEach(ticket => {
        const category = ticket.category || ticket.subject || 'General';
        analytics.supportStats.ticketCategories[category] =
            (analytics.supportStats.ticketCategories[category] || 0) + 1;

        if (ticket.priority === 'urgent' || ticket.urgent) {
            analytics.supportStats.urgentTickets++;
        }
    });

    // Calculate average resolution time (simplified - in hours)
    const resolvedTickets = supportTickets.filter(ticket =>
        (ticket.status === 'resolved' || ticket.status === 'closed') &&
        ticket.createdAt && ticket.resolvedAt
    );
    if (resolvedTickets.length > 0) {
        const totalResolutionTime = resolvedTickets.reduce((sum, ticket) => {
            const created = new Date(ticket.createdAt);
            const resolved = new Date(ticket.resolvedAt);
            return sum + (resolved - created) / (1000 * 60 * 60); // hours
        }, 0);
        analytics.supportStats.avgResolutionTime = totalResolutionTime / resolvedTickets.length;
    }

    // Calculate customer request analytics
    analytics.requestStats.totalRequests = accountRequests.length;
    analytics.requestStats.pendingRequests = accountRequests.filter(req =>
        !req.resolved && req.status !== 'completed'
    ).length;
    analytics.requestStats.resolvedRequests = accountRequests.filter(req =>
        req.resolved || req.status === 'completed'
    ).length;

    // Calculate common issues from requests
    accountRequests.forEach(request => {
        const issue = request.category || request.subject || request.type || 'General';
        analytics.requestStats.commonIssues[issue] =
            (analytics.requestStats.commonIssues[issue] || 0) + 1;
    });

    return analytics;
}

// Refresh Analytics
function refreshAnalytics() {
    loadProductAnalytics();
}

// Helper function for status icons
function getStatusIcon(status) {
    const icons = {
        pending: 'fa-clock',
        confirmed: 'fa-check-circle',
        completed: 'fa-check-double',
        processing: 'fa-cog',
        hold: 'fa-pause-circle',
        cancelled: 'fa-times-circle',
        refunded: 'fa-undo'
    };
    return icons[status] || 'fa-question-circle';
}

// Add Analytics Styles
function addAnalyticsStyles() {
    if (document.getElementById('analytics-styles')) return;

    const styles = document.createElement('style');
    styles.id = 'analytics-styles';
    styles.textContent = `
        .analytics-dashboard {
            padding: 20px 0;
        }

        .analytics-summary {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 15px;
            margin-bottom: 30px;
        }

        .summary-card {
            background: white;
            border: 1px solid #e9ecef;
            border-radius: 12px;
            padding: 20px;
            display: flex;
            align-items: center;
            gap: 15px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        }

        .summary-icon {
            font-size: 24px;
        }

        .summary-content h4 {
            margin: 0 0 5px 0;
            font-size: 14px;
            color: #6c757d;
            font-weight: 500;
        }

        .summary-value {
            margin: 0;
            font-size: 24px;
            font-weight: bold;
            color: #2c3e50;
        }

        .analytics-section {
            background: white;
            border: 1px solid #e9ecef;
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        }

        .analytics-section h4 {
            margin: 0 0 15px 0;
            color: #2c3e50;
            font-size: 18px;
        }

        .analytics-table table {
            width: 100%;
            border-collapse: collapse;
        }

        .analytics-table th,
        .analytics-table td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #e9ecef;
        }

        .analytics-table th {
            background: #f8f9fa;
            font-weight: 600;
            color: #495057;
        }

        .status-badge {
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 500;
        }

        .status-in { background: #d4edda; color: #155724; }
        .status-low { background: #fff3cd; color: #856404; }
        .status-out { background: #f8d7da; color: #721c24; }

        .category-performance {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        .category-item {
            display: flex;
            align-items: center;
            gap: 15px;
        }

        .category-name {
            min-width: 120px;
            font-weight: 500;
        }

        .category-bar {
            flex: 1;
            height: 20px;
            background: #e9ecef;
            border-radius: 10px;
            overflow: hidden;
        }

        .bar-fill {
            height: 100%;
            background: linear-gradient(90deg, #3498db, #2ecc71);
            border-radius: 10px;
            transition: width 0.3s ease;
        }

        .category-stats {
            min-width: 80px;
            text-align: right;
            font-weight: 500;
            color: #495057;
        }

        .low-stock-list {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        .low-stock-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px;
            background: #fff3cd;
            border: 1px solid #ffeaa7;
            border-radius: 8px;
        }

        .product-info strong {
            display: block;
            color: #2c3e50;
        }

        .product-info span {
            color: #6c757d;
            font-size: 14px;
        }

        .stock-count {
            font-weight: bold;
            padding: 4px 8px;
            border-radius: 4px;
        }

        .low-stock {
            background: #fff3cd;
            color: #856404;
        }

        .out-of-stock {
            background: #f8d7da;
            color: #721c24;
        }

        .no-alerts {
            text-align: center;
            color: #28a745;
            font-style: italic;
            margin: 20px 0;
        }

        .analytics-loading {
            text-align: center;
            padding: 40px;
        }

        .analytics-loading .spinner {
            border: 4px solid #f3f3f3;
            border-top: 4px solid #3498db;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 0 auto 20px;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        .error-message {
            text-align: center;
            padding: 40px;
            color: #dc3545;
        }

        .error-message i {
            font-size: 48px;
            margin-bottom: 20px;
        }

        .no-data-message {
            text-align: center;
            padding: 40px;
            color: #6c757d;
        }

        .no-data-message i {
            font-size: 48px;
            margin-bottom: 20px;
            color: #dee2e6;
        }

        .no-data-message h5 {
            margin: 0 0 10px 0;
            color: #495057;
        }

        .no-data-message p {
            margin: 0;
            font-size: 14px;
        }

        /* Order Status Analytics */
        .order-status-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
            gap: 15px;
        }

        .status-card {
            background: white;
            border: 1px solid #e9ecef;
            border-radius: 8px;
            padding: 15px;
            display: flex;
            align-items: center;
            gap: 10px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        .status-card.status-pending { border-left: 4px solid #f39c12; }
        .status-card.status-confirmed { border-left: 4px solid #3498db; }
        .status-card.status-completed { border-left: 4px solid #2ecc71; }
        .status-card.status-processing { border-left: 4px solid #9b59b6; }
        .status-card.status-hold { border-left: 4px solid #e74c3c; }
        .status-card.status-cancelled { border-left: 4px solid #95a5a6; }
        .status-card.status-refunded { border-left: 4px solid #f1c40f; }

        .status-icon {
            font-size: 20px;
            color: #6c757d;
        }

        .status-info h5 {
            margin: 0 0 5px 0;
            font-size: 12px;
            color: #6c757d;
            font-weight: 600;
            text-transform: uppercase;
        }

        .status-count {
            margin: 0;
            font-size: 24px;
            font-weight: bold;
            color: #2c3e50;
        }

        /* Support Analytics */
        .support-analytics-grid,
        .request-analytics-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 15px;
            margin-bottom: 20px;
        }

        .support-metric,
        .request-metric {
            background: white;
            border: 1px solid #e9ecef;
            border-radius: 8px;
            padding: 15px;
            display: flex;
            align-items: center;
            gap: 12px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        .metric-icon {
            font-size: 24px;
        }

        .metric-content h5 {
            margin: 0 0 5px 0;
            font-size: 12px;
            color: #6c757d;
            font-weight: 600;
        }

        .metric-value {
            margin: 0;
            font-size: 20px;
            font-weight: bold;
            color: #2c3e50;
        }

        .resolution-time,
        .common-issues,
        .ticket-categories {
            margin-top: 20px;
        }

        .resolution-time h5,
        .common-issues h5,
        .ticket-categories h5 {
            margin: 0 0 10px 0;
            color: #2c3e50;
            font-size: 14px;
        }

        .resolution-value {
            font-size: 18px;
            font-weight: bold;
            color: #3498db;
            margin: 0;
        }

        .category-tags {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        }

        .category-tag {
            background: #f8f9fa;
            color: #495057;
            padding: 4px 8px;
            border-radius: 12px;
            font-size: 12px;
            border: 1px solid #dee2e6;
        }

        .tag-count {
            font-weight: bold;
            color: #007bff;
        }

        .issue-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .issue-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 12px;
            background: #f8f9fa;
            border-radius: 6px;
            border: 1px solid #dee2e6;
        }

        .issue-name {
            font-weight: 500;
            color: #495057;
        }

        .issue-count {
            background: #007bff;
            color: white;
            padding: 2px 6px;
            border-radius: 10px;
            font-size: 12px;
            font-weight: bold;
        }
    `;
    document.head.appendChild(styles);
}