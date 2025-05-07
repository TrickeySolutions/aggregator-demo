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
        this.sections = ['organisation', 'security', 'coverage', 'review'];
        this.formState = {};
        this.isLoading = false;
        this.touchedFields = new Set();
        this.validationTimeout = null;
        
        this.setupWebSocket();
        this.setupNavigation();
        this.setupValidation();
        this.setupLoadingIndicator();

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
            });
            
            // Handle messages
            this.ws.addEventListener('message', (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'state_update') {
                        this.updateFormState(data.state);
                    } else if (data.type === 'error') {
                        this.showError('Server Error', data.error);
                    }
                } catch (err) {
                    console.error('Failed to parse WebSocket message:', err);
                }
            });

            // Handle errors
            this.ws.addEventListener('error', (error) => {
                console.error('WebSocket error:', error);
                this.showError('Connection error', 'Failed to connect to server. Please refresh the page.');
            });

            // Handle disconnection with reconnection attempt
            this.ws.addEventListener('close', () => {
                console.log('WebSocket disconnected, attempting to reconnect...');
                setTimeout(() => this.setupWebSocket(), 1000);
            });

        } catch (error) {
            console.error('WebSocket setup error:', error);
            this.showError('Connection Error', 'Failed to establish connection. Please refresh the page.');
        }
    }

    setupNavigation() {
        // Handle progress bar navigation
        document.querySelectorAll('.moj-progress-bar__link').forEach(link => {
            link.addEventListener('click', async (e) => {
                e.preventDefault();
                const targetSection = e.currentTarget.dataset.section;
                if (!targetSection) return;

                // Allow navigation to review if all sections are complete
                if (targetSection === 'review') {
                    if (this.areAllSectionsComplete()) {
                        this.showSection(targetSection);
                    }
                    return;
                }

                // Don't allow navigation to disabled sections
                if (e.currentTarget.parentElement.classList.contains('moj-progress-bar__item--disabled')) {
                    return;
                }

                // Validate current section before navigating
                if (await this.validateSection()) {
                    this.showSection(targetSection);
                }
            });
        });

        // Handle back/continue buttons
        document.querySelectorAll('[data-action="back"]').forEach(btn => {
            btn.addEventListener('click', () => this.navigate('back'));
        });

        // Handle form submissions
        this.sections.forEach(section => {
            const form = document.getElementById(`${section}-form`);
            if (!form) return;

            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                if (await this.validateSection()) {
                    const currentIndex = this.sections.indexOf(this.currentSection);
                    const nextSection = this.sections[currentIndex + 1];
                    if (nextSection) {
                        this.showSection(nextSection);
                    }
                }
            });
        });
    }

    async navigate(direction) {
        const currentIndex = this.sections.indexOf(this.currentSection);
        let nextIndex;

        if (direction === 'back') {
            nextIndex = Math.max(0, currentIndex - 1);
        } else {
            if (!await this.validateSection()) {
                return;
            }
            nextIndex = Math.min(this.sections.length - 1, currentIndex + 1);
        }

        this.showSection(this.sections[nextIndex]);
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

            // Single form submission handler
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                
                // Mark all fields in this section as touched
                form.querySelectorAll('input, select').forEach(input => {
                    this.touchedFields.add(input.id);
                });

                // Validate and save
                const formData = new FormData(form);
                const errors = this.validateFormData(formData);
                this.showErrors(errors);

                if (errors.length === 0) {
                    if (await this.saveSection(formData)) {
                        // Only move to next section if save was successful
                        const currentIndex = this.sections.indexOf(this.currentSection);
                        const nextSection = this.sections[currentIndex + 1];
                        if (nextSection) {
                            this.showSection(nextSection);
                        }
                    }
                }
            });

            // Field validation handlers
            form.querySelectorAll('input, select').forEach(input => {
                input.addEventListener('blur', () => {
                    this.touchedFields.add(input.id);
                    this.validateField(input);
                });

                input.addEventListener('input', () => {
                    if (!this.touchedFields.has(input.id)) return;
                    clearTimeout(this.validationTimeout);
                    this.validationTimeout = setTimeout(() => {
                        this.validateField(input);
                    }, 500);
                });
            });
        });
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

    showSection(sectionId) {
        // Hide all sections and clear their errors
        document.querySelectorAll('.form-section').forEach(section => {
            section.hidden = true;
            section.querySelectorAll('.govuk-form-group--error').forEach(group => {
                group.classList.remove('govuk-form-group--error');
                group.querySelector('.govuk-error-message')?.remove();
            });
        });
        
        // Clear error summary but keep touched fields state
        this.showErrors([]);
        
        // Show target section
        const targetSection = document.getElementById(`${sectionId}-section`);
        if (targetSection) {
            targetSection.hidden = false;
            this.currentSection = sectionId;
            this.updateStatusIndicators(this.formState.status);
        }
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
}

// Initialize the form
new QuoteForm(); 