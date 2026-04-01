document.addEventListener('DOMContentLoaded', async function() {
    const user = userManager.getUser();
    if (!user) {
        window.location.href = '/login.html';
        return;
    }

    const userInfo = document.getElementById('userInfo');
    if (userInfo) {
        userInfo.textContent = `欢迎，${user.username}`;
    }

    // DOM 元素引用
    const resumeList = document.getElementById('resumeList');
    const loadingDiv = document.getElementById('loading');
    const errorDiv = document.getElementById('errorMessage');
    const uploadErrorDiv = document.getElementById('uploadErrorMessage');
    const uploadSuccessDiv = document.getElementById('uploadSuccessMessage');
    const fileInput = document.getElementById('fileInput');
    const uploadArea = document.getElementById('uploadArea');
    const interviewList = document.getElementById('interviewList');
    const interviewLoading = document.getElementById('interviewLoading');
    const interviewErrorDiv = document.getElementById('interviewErrorMessage');
    const newInterviewBtn = document.getElementById('newInterviewBtn');
    const profileMessage = document.getElementById('profileMessage');
    const saveProfileBtn = document.getElementById('saveProfileBtn');

    // 模态框相关元素
    const profileLink = document.getElementById('profileLink');
    const profileModal = document.getElementById('profileModal');
    const closeProfileModalBtn = document.getElementById('closeProfileModal');
    const modalOverlay = profileModal
        ? (profileModal.querySelector('.modal-overlay') || profileModal.querySelector('.modal-overlay-animated'))
        : null;

    const profileInputs = {
        full_name: document.getElementById('fullNameInput'),
        school: document.getElementById('schoolInput'),
        degree: document.getElementById('degreeInput'),
        major: document.getElementById('majorInput'),
        graduation_year: document.getElementById('graduationYearInput'),
        target_city: document.getElementById('targetCityInput'),
        target_industry: document.getElementById('targetIndustryInput'),
        bio: document.getElementById('bioInput'),
    };

    async function loadProfile() {
        try {
            const response = await api.getUserProfile(user.id);
            const profile = response.user || {};
            Object.entries(profileInputs).forEach(([key, input]) => {
                if (input) input.value = profile[key] || '';
            });
        } catch (error) {
            if (profileMessage) {
                profileMessage.textContent = error.message;
                profileMessage.className = 'error-message';
            }
        }
    }

    async function saveProfile() {
        try {
            profileMessage.className = 'hidden';
            saveProfileBtn.disabled = true;
            saveProfileBtn.textContent = '保存中...';
            const payload = {};
            Object.entries(profileInputs).forEach(([key, input]) => {
                if (input) payload[key] = input.value.trim();
            });
            const response = await api.updateUserProfile(user.id, payload);
            userManager.setUser(response.user);
            userInfo.textContent = `欢迎，${response.user.username}`;
            profileMessage.textContent = '个人资料已更新';
            profileMessage.className = 'success-message';
            // 保存成功后立即关闭，避免首次引导场景中出现“无法关闭”的体感
            closeModal();
        } catch (error) {
            profileMessage.textContent = error.message;
            profileMessage.className = 'error-message';
        } finally {
            saveProfileBtn.disabled = false;
            saveProfileBtn.textContent = '保存资料';
        }
    }

    // 大模型状态功能已移除
    // async function loadLlmStatus() { ... }
    // async function testLlmConnection() { ... }

    async function loadResumes() {
        try {
            loadingDiv.className = 'loading-state';
            errorDiv.className = 'hidden';
            const response = await api.getUserResumes(user.id);
            displayResumes(response.resumes || []);
        } catch (error) {
            errorDiv.textContent = error.message;
            errorDiv.className = 'toast toast-error';
        } finally {
            loadingDiv.className = 'hidden';
        }
    }

    function displayResumes(resumes) {
        const resumeCount = document.getElementById('resumeCount');
        if (resumeCount) {
            resumeCount.textContent = `${resumes.length} 份`;
        }

        if (!resumes.length) {
            resumeList.innerHTML = `
                <div class="empty-state-modern">
                    <div class="empty-icon">📄</div>
                    <p>还没有上传简历<br>拖拽或点击上方区域上传</p>
                </div>
            `;
            return;
        }

        resumeList.innerHTML = resumes.map((resume) => `
            <div class="resume-card">
                <div class="resume-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                    </svg>
                </div>
                <div class="resume-info">
                    <h3 class="resume-filename">${escapeHtml(resume.filename)}</h3>
                    <div class="resume-date">${new Date(resume.created_at).toLocaleString('zh-CN')}</div>
                </div>
                <div class="resume-actions">
                    <a href="/resume.html?id=${resume.id}" class="resume-btn resume-btn-view">查看</a>
                    <button class="resume-btn resume-btn-delete" data-delete-resume="${resume.id}" data-resume-name="${escapeHtml(resume.filename)}">删除</button>
                </div>
            </div>
        `).join('');

        resumeList.querySelectorAll('[data-delete-resume]').forEach((button) => {
            button.addEventListener('click', async () => {
                const resumeId = Number(button.dataset.deleteResume);
                const resumeName = button.dataset.resumeName;
                const confirmed = window.confirm(`确认删除简历"${resumeName}"吗？这会同时删除分析结果和优化版本。`);
                if (!confirmed) {
                    return;
                }

                button.disabled = true;
                button.textContent = '删除中...';
                try {
                    await api.deleteResume(resumeId, user.id);
                    await loadResumes();
                } catch (error) {
                    errorDiv.textContent = error.message;
                    errorDiv.className = 'error-message';
                }
            });
        });
    }

    async function loadInterviewSessions() {
        try {
            interviewLoading.className = 'loading-state';
            interviewErrorDiv.className = 'hidden';
            const response = await api.getInterviewSessions(user.id);
            displayInterviewSessions(response.sessions || []);
        } catch (error) {
            interviewErrorDiv.textContent = error.message;
            interviewErrorDiv.className = 'toast toast-error';
        } finally {
            interviewLoading.className = 'hidden';
        }
    }

    function displayInterviewSessions(sessions) {
        if (!sessions.length) {
            interviewList.innerHTML = `
                <div class="empty-state-modern">
                    <div class="empty-icon">💬</div>
                    <p>还没有问诊任务<br>点击上方按钮开始您的第一次求职分析</p>
                </div>
            `;
            return;
        }

        interviewList.innerHTML = sessions.map((session) => `
            <div class="task-card">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:12px;">
                    <h3 class="task-title">${escapeHtml(session.title)}</h3>
                    <span class="task-status task-status-${session.status}">
                        <span class="status-dot"></span>
                        ${translateInterviewStatus(session.status)}
                    </span>
                </div>
                <div class="task-meta">
                    <span>${new Date(session.updated_at).toLocaleString('zh-CN')}</span>
                </div>
                <div class="task-summary">${session.summary ? escapeHtml(session.summary.substring(0, 100)) + '...' : '已开始问诊，可继续补充求职画像。'}</div>
                <div class="task-actions">
                    <a href="/interview.html?session=${session.id}" class="task-btn task-btn-primary">
                        ${session.status === 'in_progress' ? '继续问诊' : '查看结果'}
                    </a>
                    <button class="task-btn task-btn-danger" data-delete-session="${session.id}" data-session-name="${escapeHtml(session.title)}">删除</button>
                </div>
            </div>
        `).join('');

        interviewList.querySelectorAll('[data-delete-session]').forEach((button) => {
            button.addEventListener('click', async () => {
                const sessionId = Number(button.dataset.deleteSession);
                const sessionName = button.dataset.sessionName;
                const confirmed = window.confirm(`确认删除问诊任务"${sessionName}"吗？删除后聊天记录和画像都会丢失。`);
                if (!confirmed) {
                    return;
                }

                button.disabled = true;
                button.textContent = '删除中...';
                try {
                    await api.deleteInterviewSession(sessionId, user.id);
                    await loadInterviewSessions();
                } catch (error) {
                    interviewErrorDiv.textContent = error.message;
                    interviewErrorDiv.className = 'error-message';
                }
            });
        });
    }

    async function handleFileUpload(file) {
        const fileName = (file.name || '').toLowerCase();
        const isPdf = file.type === 'application/pdf' || fileName.endsWith('.pdf');
        const isDocx = file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || fileName.endsWith('.docx');

        if (!isPdf && !isDocx) {
            uploadErrorDiv.textContent = '只支持 PDF 或 DOCX 格式文件';
            uploadErrorDiv.className = 'toast toast-error';
            return;
        }

        if (file.size > 16 * 1024 * 1024) {
            uploadErrorDiv.textContent = '文件大小不能超过 16MB';
            uploadErrorDiv.className = 'toast toast-error';
            return;
        }

        uploadErrorDiv.className = 'hidden';
        uploadSuccessDiv.className = 'hidden';
        const uploadingDiv = document.getElementById('uploading');
        uploadingDiv.className = 'loading-state';
        uploadingDiv.textContent = '上传中...';

        try {
            await api.uploadResume(file, user.id);
            uploadSuccessDiv.textContent = '简历上传成功';
            uploadSuccessDiv.className = 'toast toast-success';
            setTimeout(() => {
                uploadSuccessDiv.className = 'hidden';
                loadResumes();
            }, 1200);
        } catch (error) {
            uploadErrorDiv.textContent = error.message;
            uploadErrorDiv.className = 'toast toast-error';
        } finally {
            uploadingDiv.className = 'hidden';
            fileInput.value = '';
        }
    }

    function setModalVisible(visible) {
        if (!profileModal) {
            return;
        }
        if (visible) {
            profileModal.classList.remove('hidden');
            profileModal.style.display = '';
            document.body.style.overflow = 'hidden';
            return;
        }
        profileModal.classList.add('hidden');
        profileModal.style.display = 'none';
        document.body.style.overflow = '';
    }

    function closeModal() {
        setModalVisible(false);
    }

    // 模态框控制
    if (profileModal) {
        // 打开模态框（按钮在某些首次引导场景可能不存在）
        if (profileLink) {
            profileLink.addEventListener('click', () => {
                setModalVisible(true);
            });
        }

        // 多种关闭方式
        if (closeProfileModalBtn) {
            closeProfileModalBtn.addEventListener('click', closeModal);
        }
        if (modalOverlay) {
            modalOverlay.addEventListener('click', closeModal);
        }

        // ESC 键关闭
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !profileModal.classList.contains('hidden')) {
                closeModal();
            }
        });
    }

    // 保存资料按钮事件绑定
    if (saveProfileBtn) {
        saveProfileBtn.addEventListener('click', async () => {
            await saveProfile();
        });
    }

    newInterviewBtn.addEventListener('click', async () => {
        newInterviewBtn.disabled = true;
        newInterviewBtn.textContent = '创建中...';
        interviewErrorDiv.className = 'hidden';

        try {
            const response = await api.createInterviewSession(user.id);
            window.location.href = `/interview.html?session=${response.session.id}`;
        } catch (error) {
            interviewErrorDiv.textContent = error.message;
            interviewErrorDiv.className = 'error-message';
        } finally {
            newInterviewBtn.disabled = false;
            newInterviewBtn.textContent = '开始新问诊';
        }
    });

    uploadArea.addEventListener('click', () => fileInput.click());
    uploadArea.addEventListener('dragover', (event) => {
        event.preventDefault();
        uploadArea.classList.add('dragover');
    });
    uploadArea.addEventListener('dragleave', (event) => {
        event.preventDefault();
        uploadArea.classList.remove('dragover');
    });
    uploadArea.addEventListener('drop', (event) => {
        event.preventDefault();
        uploadArea.classList.remove('dragover');
        const file = event.dataTransfer.files[0];
        if (file) {
            handleFileUpload(file);
        }
    });

    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            handleFileUpload(file);
        }
    });

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            userManager.clearUser();
            window.location.href = '/login.html';
        });
    }

    // 初始化加载（移除了 loadLlmStatus）
    await Promise.all([loadProfile(), loadResumes(), loadInterviewSessions()]);
});

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
}

function translateInterviewStatus(status) {
    if (status === 'confirmed') {
        return '已确认';
    }
    if (status === 'completed') {
        return '待确认';
    }
    return '进行中';
}
