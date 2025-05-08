/**
 * QuoteForm - Handles the quote form UI and interactions
 * 
 * Features:
 * - Multi-step form navigation
 * - Real-time validation
 * - WebSocket state sync
 * - Progress tracking
 * - Error handling
 */
console.log('Quote form script loaded');

class QuoteForm {
    constructor() {
        console.log('QuoteForm initialized');
        this.ws = null;
        this.currentSection = 'organisation';
        this.sections = ['organisation', 'exposure', 'security', 'review'];
        this.formState = {};
        this.isLoading = false;
        this.touchedFields = new Set();
        this.validationTimeout = null;
        
        this.setupWebSocket();
        this.setupNavigation();
        this.setupValidation();
        this.setupLoadingIndicator();
        this.setupSectorSelection();
        this.setupRevenueInput();
        this.setupEmployeesInput();
        this.setupRemoteWorkingInput();
        this.setupAIUsageConditionals();

        // Add draft handling
        document.querySelectorAll('[data-action="save-draft"], [data-action="submit"]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const action = btn.dataset.action;
                try {
                    this.showLoading(true);
                    
                    // Send appropriate message via WebSocket
                    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                        this.ws.send(JSON.stringify({
                            type: action === 'save-draft' ? 'save_draft' : 'submit'
                        }));

                        // Wait for confirmation
                        await new Promise((resolve, reject) => {
                            const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);
                            const handler = (event) => {
                                const data = JSON.parse(event.data);
                                if (data.type === 'state_update' && 
                                    data.state.status === (action === 'save-draft' ? 'draft' : 'completed')) {
                                    clearTimeout(timeout);
                                    this.ws.removeEventListener('message', handler);
                                    resolve(data);
                                }
                            };
                            this.ws.addEventListener('message', handler);
                        });

                        // Redirect to home page
                        window.location.href = '/';
                    }
                } catch (error) {
                    console.error('Failed to save/submit:', error);
                    this.showError('Save Error', 'Failed to save your changes. Please try again.');
                } finally {
                    this.showLoading(false);
                }
            });
        });
    }

    setupLoadingIndicator() {
        const template = `
            <div class="govuk-loading-spinner" hidden>
                <div class="govuk-loading-spinner__spinner"></div>
                <span class="govuk-loading-spinner__label">Saving changes...</span>
            </div>
        `;
        document.querySelector('main').insertAdjacentHTML('afterbegin', template);
    }

    showLoading(show = true) {
        const spinner = document.querySelector('.govuk-loading-spinner');
        spinner.hidden = !show;
        this.isLoading = show;
        
        // Disable all form controls while loading
        document.querySelectorAll('button, input, select').forEach(el => {
            el.disabled = show;
        });
    }

    /**
     * Sets up WebSocket connection for real-time state updates
     * @returns {Promise<void>}
     */
    async setupWebSocket() {
        console.log('Setting up WebSocket');
        const path = window.location.pathname;
        const matches = path.match(/\/customer\/([a-f0-9]+)\/activity\/([a-f0-9]{64})\/quote$/);
        if (!matches) {
            console.error('Invalid URL format for WebSocket connection');
            return;
        }

        try {
            const [, customerId, activityId] = matches;
            const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${wsProtocol}//${location.host}/api/customer/${customerId}/activity/${activityId}`;
            
            // Create WebSocket without protocol
            this.ws = new WebSocket(wsUrl);
            
            // Set up connection timeout
            const connectionTimeout = setTimeout(() => {
                if (this.ws.readyState !== WebSocket.OPEN) {
                    this.ws.close();
                    this.showError('Connection timeout', 'Unable to connect to server. Please refresh the page.');
                }
            }, 5000);

            // Handle successful connection
            this.ws.addEventListener('open', () => {
                console.log('WebSocket connected');
                clearTimeout(connectionTimeout);
                // Request initial state
                this.ws.send(JSON.stringify({ type: 'get_state' }));
            });

            this.ws.addEventListener('message', (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'state_update') {
                        this.formState = data.state;
                        this.updateFormFromState();
                    }
                } catch (err) {
                    console.error('Failed to parse WebSocket message:', err);
                }
            });

            this.ws.addEventListener('close', () => {
                console.log('WebSocket disconnected, attempting to reconnect...');
                setTimeout(() => this.setupWebSocket(), 1000);
            });

        } catch (error) {
            console.error('WebSocket setup error:', error);
            this.showError('Connection Error', 'Failed to establish connection. Please refresh the page.');
        }
    }

    updateFormFromState() {
        if (!this.formState?.formData) return;
        
        Object.entries(this.formState.formData).forEach(([section, data]) => {
            const form = document.getElementById(`${section}-form`);
            if (!form) return;

            Object.entries(data).forEach(([key, value]) => {
                const input = form.querySelector(`[name="${key}"]`);
                if (!input) return;

                if (input.type === 'checkbox') {
                    input.checked = value;
                    // Trigger change event for conditionals
                    input.dispatchEvent(new Event('change'));
                } else if (input.type === 'radio') {
                    const radio = form.querySelector(`input[name="${key}"][value="${value}"]`);
                    if (radio) {
                        radio.checked = true;
                        radio.dispatchEvent(new Event('change'));
                    }
                } else {
                    input.value = value;
                }
            });
        });
    }

    setupNavigation() {
        // Handle form submissions
        document.querySelectorAll('form').forEach(form => {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                
                const currentSection = this.currentSection;
                const formData = new FormData(form);
                const sectionData = {};
                
                // Convert FormData to object
                formData.forEach((value, key) => {
                    if (sectionData[key]) {
                        if (!Array.isArray(sectionData[key])) {
                            sectionData[key] = [sectionData[key]];
                        }
                        sectionData[key].push(value);
                    } else {
                        sectionData[key] = value;
                    }
                });

                // Update form state
                if (!this.formState.formData) {
                    this.formState.formData = {};
                }
                this.formState.formData[currentSection] = sectionData;

                // Send state update via WebSocket
                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                    await this.ws.send(JSON.stringify({
                        type: 'update_section',
                        section: currentSection,
                        data: sectionData
                    }));
                }

                // Move to next section
                const currentIndex = this.sections.indexOf(currentSection);
                if (currentIndex < this.sections.length - 1) {
                    const nextSection = this.sections[currentIndex + 1];
                    await this.showSection(nextSection);
                }
            });
        });

        // Update progress bar navigation
        document.querySelectorAll('.moj-progress-bar__link').forEach(link => {
            link.addEventListener('click', async (e) => {
                e.preventDefault();
                const section = e.target.closest('[data-section]').dataset.section;
                await this.showSection(section);
            });
        });
    }

    showSection(sectionId) {
        // Hide all sections
        document.querySelectorAll('.form-section').forEach(section => {
            section.hidden = true;
        });
        
        // Show requested section
        const section = document.getElementById(`${sectionId}-section`);
        if (section) {
            section.hidden = false;
            this.currentSection = sectionId;
            
            // Handle review section specially
            if (sectionId === 'review') {
                this.populateReviewSection();
            }
            
            // Update progress bar
            document.querySelectorAll('.moj-progress-bar__item').forEach(item => {
                const itemSection = item.querySelector('[data-section]').dataset.section;
                item.classList.remove('moj-progress-bar__item--current');
                if (itemSection === sectionId) {
                    item.classList.add('moj-progress-bar__item--current');
                }
            });
        }
    }

    populateReviewSection() {
        const reviewSection = document.getElementById('review-section');
        if (!reviewSection) return;

        // Clear existing content
        const contentDiv = reviewSection.querySelector('.review-content');
        if (!contentDiv) return;
        contentDiv.innerHTML = '';

        // Add summary for each completed section
        this.sections.slice(0, -1).forEach(section => {
            const sectionData = this.formState.formData?.[section];
            if (sectionData) {
                const summary = this.createSectionSummary(section, sectionData);
                contentDiv.appendChild(summary);
            }
        });
    }

    async validateSection() {
        const form = document.querySelector(`#${this.currentSection}-form`);
        if (!form) return true;

        // Mark all fields as touched
        form.querySelectorAll('input, select').forEach(input => {
            this.touchedFields.add(input.id);
        });

        const formData = new FormData(form);
        const errors = this.validateFormData(formData);
        this.showErrors(errors);

        if (errors.length > 0) {
            return false;
        }

        await this.saveSection(formData);
        return true;
    }

    showErrors(errors) {
        const summary = document.querySelector('.govuk-error-summary');
        const list = summary.querySelector('.govuk-error-summary__list');
        
        if (errors.length === 0) {
            summary.hidden = true;
            return;
        }

        list.innerHTML = '';
        errors.forEach(error => {
            const li = document.createElement('li');
            li.innerHTML = `<a href="#${error.field}">${error.message}</a>`;
            list.appendChild(li);
        });

        summary.hidden = false;
        summary.focus();
    }

    updateFormState(state) {
        this.formState = state;
        
        // Update current section if not actively editing
        if (state.currentSection && !this.isLoading) {
            this.showSection(state.currentSection);
        }
        
        // Update form fields
        if (state.formData) {
            Object.entries(state.formData).forEach(([section, data]) => {
                const form = document.getElementById(`${section}-form`);
                if (!form) return;

                Object.entries(data).forEach(([field, value]) => {
                    const input = form.elements[field];
                    if (!input) return;

                    if (input.type === 'checkbox') {
                        input.checked = !!value;
                    } else if (input.type === 'radio') {
                        const radio = form.querySelector(`input[name="${field}"][value="${value}"]`);
                        if (radio) radio.checked = true;
                    } else {
                        input.value = value;
                    }
                });
            });
        }

        // Update review section
        this.updateReviewSection();

        // Update status indicators
        this.updateStatusIndicators(state.status);
    }

    updateReviewSection() {
        const dl = document.querySelector('#review-section .govuk-summary-list');
        if (!dl || !this.formState.formData) return;
        
        dl.innerHTML = '';

        // Add section headers and content
        const sections = {
            organisation: 'Organisation Details',
            security: 'IT Security',
            coverage: 'Coverage Requirements'
        };

        Object.entries(sections).forEach(([section, title]) => {
            const sectionData = this.formState.formData[section];
            if (!sectionData) return;

            // Add section header
            const header = document.createElement('div');
            header.className = 'govuk-summary-list__row govuk-summary-list__row--header';
            header.innerHTML = `
                <dt class="govuk-summary-list__key govuk-heading-m">
                    ${title}
                </dt>
                <dd class="govuk-summary-list__actions">
                    <a class="govuk-link" href="#" data-section="${section}">
                        Change<span class="govuk-visually-hidden"> ${title}</span>
                    </a>
                </dd>
            `;
            dl.appendChild(header);

            // Add section fields
            Object.entries(sectionData).forEach(([field, value]) => {
                const row = this.createSummaryRow(section, field, value);
                dl.appendChild(row);
            });
        });

        // Add event listeners for "Change" links
        dl.querySelectorAll('[data-section]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const section = e.currentTarget.dataset.section;
                if (section) this.showSection(section);
            });
        });
    }

    createSummaryRow(section, field, value) {
        const div = document.createElement('div');
        div.className = 'govuk-summary-list__row';
        div.innerHTML = `
            <dt class="govuk-summary-list__key">
                ${this.formatFieldName(field)}
            </dt>
            <dd class="govuk-summary-list__value">
                ${this.formatFieldValue(value)}
            </dd>
        `;
        return div;
    }

    setupValidation() {
        this.sections.forEach(section => {
            const form = document.getElementById(`${section}-form`);
            if (!form) return;

            // Add blur and input handlers for real-time updates
            form.querySelectorAll('input, select').forEach(input => {
                // Update on blur
                input.addEventListener('blur', async () => {
                    this.touchedFields.add(input.id);
                    await this.saveFieldUpdate(input);
                });

                // Update on input with debounce
                input.addEventListener('input', () => {
                    if (!this.touchedFields.has(input.id)) return;
                    clearTimeout(this.validationTimeout);
                    this.validationTimeout = setTimeout(async () => {
                        await this.saveFieldUpdate(input);
                    }, 500);
                });
            });
        });
    }

    async saveFieldUpdate(input) {
        const form = input.closest('form');
        if (!form) return;

        const formData = new FormData(form);
        const sectionData = {};
        
        // Convert FormData to object
        formData.forEach((value, key) => {
            if (key.endsWith('Enabled')) {
                sectionData[key] = value === 'true';
            } else {
                sectionData[key] = value;
            }
        });

        // Send update via WebSocket
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'form_update',
                formData: {
                    [this.currentSection]: sectionData
                }
            }));
        }
    }

    validateField(field) {
        if (!this.touchedFields.has(field.id)) return;

        const form = field.closest('form');
        if (!form) return;

        const formData = new FormData(form);
        const errors = this.validateFormData(formData)
            .filter(error => error.field === field.id);

        // Update field-level error styling
        this.showFieldError(field, errors[0]?.message);

        // Only show error summary if there are errors and the field has been touched
        const allErrors = this.validateFormData(formData)
            .filter(error => this.touchedFields.has(error.field));
        this.showErrors(allErrors);
    }

    showError(title, message) {
        const summary = document.querySelector('.govuk-error-summary');
        const titleEl = summary.querySelector('.govuk-error-summary__title');
        const list = summary.querySelector('.govuk-error-summary__list');
        
        if (!message) {
            summary.hidden = true;
            return;
        }
        
        titleEl.textContent = title;
        list.innerHTML = `<li>${message}</li>`;
        
        summary.hidden = false;
        summary.focus();
    }

    /**
     * Validates the current section's form data
     * @param {FormData} formData - Form data to validate
     * @returns {Array<{field: string, message: string}>} Array of validation errors
     */
    validateFormData(formData) {
        const errors = [];
        const section = this.currentSection;

        // Only validate touched fields
        for (const [field, value] of formData.entries()) {
            const input = document.getElementById(field);
            if (input?.required && !value && input.type !== 'checkbox' && this.touchedFields.has(field)) {
                errors.push({
                    field,
                    message: `${this.formatFieldName(field)} is required`
                });
            }
        }

        // Section-specific validation
        switch (section) {
            case 'security':
                // Check if any security controls are selected
                const securityControls = ['antivirusEnabled', 'firewallEnabled', 'mfaEnabled'];
                const hasControls = securityControls.some(control => formData.get(control) === 'true');
                
                // Only validate if any control has been touched
                const controlsTouched = securityControls.some(control => this.touchedFields.has(control));
                if (controlsTouched && !hasControls) {
                    errors.push({
                        field: 'antivirusEnabled',
                        message: 'At least one security control must be selected'
                    });
                }

                // Validate backup frequency
                if (this.touchedFields.has('backupFrequency') && !formData.get('backupFrequency')) {
                    errors.push({
                        field: 'backupFrequency',
                        message: 'Backup frequency is required'
                    });
                }
                break;
            case 'organisation':
                if (this.touchedFields.has('name') && !formData.get('name')) {
                    errors.push({
                        field: 'name',
                        message: 'Organisation name is required'
                    });
                }
                if (this.touchedFields.has('industry') && !formData.get('industry')) {
                    errors.push({
                        field: 'industry',
                        message: 'Industry sector is required'
                    });
                }
                if (this.touchedFields.has('revenue') && !formData.get('revenue')) {
                    errors.push({
                        field: 'revenue',
                        message: 'Annual revenue is required'
                    });
                }
                if (this.touchedFields.has('employees') && !formData.get('employees')) {
                    errors.push({
                        field: 'employees',
                        message: 'Number of employees is required'
                    });
                }
                break;
            case 'coverage':
                const limit = Number(formData.get('coverageLimit'));
                if (this.touchedFields.has('coverageLimit') && !limit) {
                    errors.push({
                        field: 'coverageLimit',
                        message: 'Coverage limit is required'
                    });
                } else if (this.touchedFields.has('coverageLimit') && limit < 100000) {
                    errors.push({
                        field: 'coverageLimit',
                        message: 'Coverage limit must be at least £100,000'
                    });
                }
                if (this.touchedFields.has('excess') && !formData.get('excess')) {
                    errors.push({
                        field: 'excess',
                        message: 'Excess amount is required'
                    });
                }
                break;
        }

        return errors;
    }

    formatFieldName(field) {
        return field
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, str => str.toUpperCase())
            .trim();
    }

    formatFieldValue(value) {
        if (typeof value === 'boolean') {
            return value ? 'Yes' : 'No';
        }
        if (typeof value === 'number') {
            return new Intl.NumberFormat('en-GB', {
                style: 'currency',
                currency: 'GBP'
            }).format(value);
        }
        if (Array.isArray(value)) {
            return value.join(', ');
        }
        return value;
    }

    async saveSection(formData) {
        try {
            this.showLoading(true);
            
            // Convert FormData to object
            const data = {};
            formData.forEach((value, key) => {
                // Handle checkboxes
                if (key.endsWith('Enabled')) {
                    data[key] = formData.get(key) === 'true';
                } else {
                    data[key] = value;
                }
            });

            // Send update via WebSocket if connected
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                await new Promise((resolve, reject) => {
                    const messageHandler = (event) => {
                        try {
                            const response = JSON.parse(event.data);
                            if (response.type === 'state_update') {
                                this.ws.removeEventListener('message', messageHandler);
                                resolve(true);
                            }
                        } catch (err) {
                            // Ignore parse errors
                        }
                    };

                    this.ws.addEventListener('message', messageHandler);

                    this.ws.send(JSON.stringify({
                        type: 'form_update',
                        formData: {
                            [this.currentSection]: data
                        }
                    }));

                    // Timeout after 5 seconds
                    setTimeout(() => {
                        this.ws.removeEventListener('message', messageHandler);
                        reject(new Error('Save timeout'));
                    }, 5000);
                });

                return true;
            } else {
                throw new Error('WebSocket not connected');
            }
        } catch (error) {
            console.error('Failed to save section:', error);
            this.showError('Save Error', 'Failed to save your changes. Please try again.');
            return false;
        } finally {
            this.showLoading(false);
        }
    }

    updateStatusIndicators(status) {
        // Update progress bar
        const progressItems = document.querySelectorAll('.moj-progress-bar__item');
        progressItems.forEach((item, index) => {
            const section = this.sections[index];
            const sectionData = this.formState.formData?.[section];
            
            // Reset classes
            item.classList.remove('moj-progress-bar__item--complete', 'moj-progress-bar__item--current', 'moj-progress-bar__item--disabled');
            
            // Add appropriate classes
            if (section === this.currentSection) {
                item.classList.add('moj-progress-bar__item--current');
            } else if (section === 'review') {
                // Enable review section if all other sections are complete
                if (this.areAllSectionsComplete()) {
                    if (this.currentSection === 'review') {
                        item.classList.add('moj-progress-bar__item--current');
                    }
                } else {
                    item.classList.add('moj-progress-bar__item--disabled');
                }
            } else if (sectionData && Object.keys(sectionData).length > 0) {
                item.classList.add('moj-progress-bar__item--complete');
            } else {
                item.classList.add('moj-progress-bar__item--disabled');
            }
        });

        // Update status message if needed
        if (status === 'completed') {
            this.showSuccess('Quote request submitted', 'Your quote request has been submitted successfully.');
        }
    }

    showSuccess(title, message) {
        const template = `
            <div class="govuk-notification-banner govuk-notification-banner--success" role="alert">
                <div class="govuk-notification-banner__header">
                    <h2 class="govuk-notification-banner__title">${title}</h2>
                </div>
                <div class="govuk-notification-banner__content">
                    <p class="govuk-notification-banner__heading">${message}</p>
                </div>
            </div>
        `;
        document.querySelector('main').insertAdjacentHTML('afterbegin', template);
    }

    // Add field-level error styling
    showFieldError(field, error) {
        const formGroup = field.closest('.govuk-form-group');
        if (!formGroup) return;

        if (error) {
            formGroup.classList.add('govuk-form-group--error');
            
            // Add error message
            const errorMessage = document.createElement('span');
            errorMessage.className = 'govuk-error-message';
            errorMessage.innerHTML = `<span class="govuk-visually-hidden">Error:</span> ${error}`;
            
            // Insert error message after label
            const label = formGroup.querySelector('.govuk-label');
            if (label) {
                label.after(errorMessage);
            }
        } else {
            formGroup.classList.remove('govuk-form-group--error');
            formGroup.querySelector('.govuk-error-message')?.remove();
        }
    }

    areAllSectionsComplete() {
        // Check if all sections except review have data
        return this.sections.slice(0, -1).every(section => {
            const sectionData = this.formState.formData?.[section];
            return sectionData && Object.keys(sectionData).length > 0;
        });
    }

    setupSectorSelection() {
        const sectorOptions = {
            public: [
                { value: 'central-government', label: 'Central Government' },
                { value: 'local-government', label: 'Local Government' },
                { value: 'nhs', label: 'NHS / Healthcare' },
                { value: 'education', label: 'Education' },
                { value: 'emergency-services', label: 'Emergency Services' },
                { value: 'housing', label: 'Housing Association' }
            ],
            third: [
                { value: 'charity', label: 'Charity / Non-profit' }
            ],
            private: [
                { value: 'technology', label: 'Technology' },
                { value: 'finance', label: 'Financial Services' },
                { value: 'retail', label: 'Retail' },
                { value: 'manufacturing', label: 'Manufacturing' },
                { value: 'healthcare-private', label: 'Private Healthcare' },
                { value: 'legal', label: 'Legal Services' },
                { value: 'construction', label: 'Construction' },
                { value: 'utilities', label: 'Utilities' },
                { value: 'transport', label: 'Transport' },
                { value: 'other', label: 'Other' }
            ]
        };

        const industrySelect = document.getElementById('industry');
        const industryGroup = document.getElementById('industry-select-group');

        document.querySelectorAll('input[name="sector-type"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                const selectedType = e.target.value;
                
                // Show the dropdown
                industryGroup.hidden = false;
                
                // Clear and populate the dropdown
                industrySelect.innerHTML = '<option value="">Choose specific sector</option>';
                
                sectorOptions[selectedType].forEach(option => {
                    const optionEl = document.createElement('option');
                    optionEl.value = option.value;
                    optionEl.textContent = option.label;
                    industrySelect.appendChild(optionEl);
                });

                // Clear any existing selection
                industrySelect.value = '';
            });
        });

        // Handle pre-selected values when returning to the form
        if (this.formState?.formData?.organisation?.industry) {
            const industry = this.formState.formData.organisation.industry;
            let sectorType;
            
            // Determine sector type from industry value
            for (const [type, options] of Object.entries(sectorOptions)) {
                if (options.some(opt => opt.value === industry)) {
                    sectorType = type;
                    break;
                }
            }

            if (sectorType) {
                const radio = document.getElementById(`sector-${sectorType}`);
                if (radio) {
                    radio.checked = true;
                    radio.dispatchEvent(new Event('change'));
                    industrySelect.value = industry;
                }
            }
        }
    }

    setupRevenueInput() {
        const slider = document.getElementById('revenue-slider');
        const display = document.getElementById('revenue-display');
        const input = document.getElementById('revenue');
        
        // Exponential scale for revenue values with ranges
        const revenueRanges = [
            { value: 0, label: 'Up to £10,000' },
            { value: 10000, label: '£10,000 - £50,000' },
            { value: 50000, label: '£50,000 - £100,000' },
            { value: 100000, label: '£100,000 - £500,000' },
            { value: 500000, label: '£500,000 - £1 million' },
            { value: 1000000, label: '£1 million - £5 million' },
            { value: 5000000, label: '£5 million - £10 million' },
            { value: 10000000, label: '£10 million - £50 million' },
            { value: 50000000, label: '£50 million - £100 million' },
            { value: 100000000, label: '£100 million - £500 million' },
            { value: 500000000, label: '£500 million - £1 billion' },
            { value: 1000000000, label: '£1 billion - £5 billion' },
            { value: 5000000000, label: 'Over £5 billion' }
        ];

        slider.addEventListener('input', (e) => {
            const index = parseInt(e.target.value);
            display.textContent = revenueRanges[index].label;
            input.value = revenueRanges[index].value;
        });

        // Format on initial load if value exists
        if (this.formState?.formData?.organisation?.revenue) {
            const value = parseInt(this.formState.formData.organisation.revenue);
            const index = revenueRanges.findIndex(range => range.value >= value);
            if (index !== -1) {
                slider.value = index;
                display.textContent = revenueRanges[index].label;
                input.value = revenueRanges[index].value;
            }
        } else {
            // Set initial value
            display.textContent = revenueRanges[0].label;
            input.value = revenueRanges[0].value;
        }
    }

    setupEmployeesInput() {
        const slider = document.getElementById('employees-slider');
        const display = document.getElementById('employees');
        
        const employeeRanges = [
            { value: '1-10', label: '1 to 10 employees' },
            { value: '11-50', label: '11 to 50 employees' },
            { value: '51-100', label: '51 to 100 employees' },
            { value: '101-250', label: '101 to 250 employees' },
            { value: '251-500', label: '251 to 500 employees' },
            { value: '501-1000', label: '501 to 1,000 employees' },
            { value: '1001-2500', label: '1,001 to 2,500 employees' },
            { value: '2501-5000', label: '2,501 to 5,000 employees' },
            { value: '5001-10000', label: '5,001 to 10,000 employees' },
            { value: '10000+', label: 'Over 10,000 employees' }
        ];

        // Update max value to match new array length
        slider.max = employeeRanges.length - 1;

        slider.addEventListener('input', (e) => {
            const index = parseInt(e.target.value);
            display.textContent = employeeRanges[index].label;
            display.dataset.value = employeeRanges[index].value;
        });

        // Set initial value
        if (this.formState?.formData?.organisation?.employees) {
            const value = this.formState.formData.organisation.employees;
            const index = employeeRanges.findIndex(range => range.value === value);
            if (index !== -1) {
                slider.value = index;
                display.textContent = employeeRanges[index].label;
                display.dataset.value = employeeRanges[index].value;
            }
        } else {
            display.textContent = employeeRanges[0].label;
            display.dataset.value = employeeRanges[0].value;
        }
    }

    setupRemoteWorkingInput() {
        const slider = document.getElementById('remote-slider');
        const display = document.getElementById('remote-display');
        const input = document.getElementById('remote-percentage');
        
        const percentageRanges = [
            { value: 0, label: 'No remote working (0%)' },
            { value: 10, label: 'Up to 10%' },
            { value: 25, label: '10% to 25%' },
            { value: 50, label: '25% to 50%' },
            { value: 60, label: '50% to 60%' },
            { value: 70, label: '60% to 70%' },
            { value: 80, label: '70% to 80%' },
            { value: 90, label: '80% to 90%' },
            { value: 95, label: '90% to 95%' },
            { value: 99, label: '95% to 99%' },
            { value: 100, label: 'Fully remote (100%)' }
        ];

        slider.addEventListener('input', (e) => {
            const index = parseInt(e.target.value);
            display.textContent = percentageRanges[index].label;
            input.value = percentageRanges[index].value;
        });

        // Set initial value
        if (this.formState?.formData?.organisation?.remote_percentage) {
            const value = parseInt(this.formState.formData.organisation.remote_percentage);
            const index = percentageRanges.findIndex(range => range.value >= value);
            if (index !== -1) {
                slider.value = index;
                display.textContent = percentageRanges[index].label;
                input.value = percentageRanges[index].value;
            }
        } else {
            display.textContent = percentageRanges[0].label;
            input.value = percentageRanges[0].value;
        }
    }

    setupAIUsageConditionals() {
        const mainCheckboxes = document.querySelectorAll('input[name="ai_usage"]');
        console.log('Found AI checkboxes:', mainCheckboxes.length);

        function updateConditionals(checkbox) {
            console.log('Updating conditional for:', checkbox.id);
            if (checkbox.hasAttribute('aria-controls')) {
                const conditional = document.getElementById(checkbox.getAttribute('aria-controls'));
                console.log('Found conditional:', conditional?.id);
                
                if (conditional) {
                    if (checkbox.checked) {
                        console.log('Showing conditional');
                        checkbox.setAttribute('aria-expanded', 'true');
                        conditional.classList.remove('govuk-checkboxes__conditional--hidden');
                    } else {
                        console.log('Hiding conditional');
                        checkbox.setAttribute('aria-expanded', 'false');
                        conditional.classList.add('govuk-checkboxes__conditional--hidden');
                        // Clear sub-checkboxes when parent is unchecked
                        conditional.querySelectorAll('input[type="checkbox"]').forEach(input => {
                            input.checked = false;
                        });
                    }
                }
            }
        }

        mainCheckboxes.forEach(checkbox => {
            // Set initial state to hidden
            if (checkbox.hasAttribute('aria-controls')) {
                const conditional = document.getElementById(checkbox.getAttribute('aria-controls'));
                if (conditional) {
                    conditional.classList.add('govuk-checkboxes__conditional--hidden');
                }
            }
            
            // Handle changes
            checkbox.addEventListener('change', (e) => {
                updateConditionals(e.target);
            });
        });
    }
}

// Initialize the form
new QuoteForm(); 