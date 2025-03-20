// ==UserScript==
// @name         Novel AI 감정 이미지 (Chrome)
// @namespace    chrome-extension
// @version      2.0
// @description  Novel AI에서 AI API를 활용하여 캐릭터의 감정을 시각화하고 통합된 UI로 관리
// @author       깡갤
// @match        https://novelai.net/*
// @icon         https://novelai.net/_next/static/media/pen-tip-light.47883c90.svg
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    // 스크립트 시작 부분 근처에 이 코드 추가
    document.addEventListener('DOMContentLoaded', function () {
        const container = document.getElementById('emotion-status-container');
        if (container) {
            container.style.position = 'fixed';
            container.style.top = '0';
            container.style.left = '0';
            container.style.width = '100%';
            container.style.right = '0';
            container.style.borderRadius = '0';
        }
    });

    // localStorage 헬퍼 함수 (GM_* 함수 대체)
    const localStorage_getValue = function (key, defaultValue) {
        const value = localStorage.getItem(key);
        if (value === null) return defaultValue;
        try {
            return JSON.parse(value);
        } catch (e) {
            return value;
        }
    };

    const localStorage_setValue = function (key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    };

    // GM_addStyle 대체 함수
    const addStyle = function (css) {
        const style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);
    };

    // 비상 모드 파라미터 확인 - URL에 ?emotion_reset=true 추가 시 설정 초기화
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('emotion_reset') === 'true') {
        localStorage_setValue('emotionVisualizerConfig', null);
        localStorage_setValue('emotionHistory', []);
        localStorage_setValue('emotionContainerPosition', null);
        localStorage_setValue('emotionContainerCollapsed', false);
        localStorage_setValue('characterPresets', {}); // 캐릭터 프리셋 초기화
        alert('감정 시각화 설정이 초기화되었습니다.');
    }

    // 기본 감정 목록 정의 (삭제할 수 없는 감정들)
    const defaultEmotions = ["행복", "슬픔", "분노", "놀람", "중립"];

    // 기본 설정
    const defaultConfig = {
        characterName: "주인공",
        apiUrl: "",
        apiKey: "",
        modelName: "gemini-pro",
        emotionImages: {
            "행복": "https://example.com/happy.png",
            "슬픔": "https://example.com/sad.png",
            "분노": "https://example.com/angry.png",
            "놀람": "https://example.com/surprised.png",
            "중립": "https://example.com/neutral.png"
        },
        customPrompt: `다음 텍스트에서 {$characterName}의 감정 상태를 분석하세요. 분석 후 다음 감정 중 하나만 반환하세요: 행복, 슬픔, 분노, 놀람, 중립. 주의: 다른 설명이나 부가 텍스트 없이 감정 단어 하나만 정확히 반환하세요.`,
        autoAnalyze: false // 자동 분석 기능 비활성화 (기본값)
    };

    // 설정 불러오기 또는 초기화
    let config = localStorage_getValue('emotionVisualizerConfig', defaultConfig);

    // 현재 활성화된 탭
    let activeTab = 'emotion'; // 기본 감정 표시 탭

    // 필요한 스타일 추가
    addStyle(`
        /* 공통 스타일 */
        .emotion-status-container {
            position: fixed;
            top: 80px;
            left: calc(100% - 300px);
            width: 400px;
            background-color: rgba(30, 30, 30, 0.9);
            border-radius: 12px;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.5);
            z-index: 99;
            overflow: hidden;
            transition: all 0.3s ease;
            color: white;
            font-family: Arial, sans-serif;
        }

        .emotion-status-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 16px;
            background-color: rgba(50, 50, 50, 0.9);
            cursor: move;
            user-select: none;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            flex-direction: column;
        }

        .emotion-status-title {
            font-size: 15px;
            font-weight: bold;
            flex-grow: 1;
            margin-right: 10px;
        }

        /* 상태창 메뉴 스타일 - 라디오 버튼 스타일 */
        .emotion-menu {
            display: flex;
            justify-content: flex-end;
            align-items: center;
            padding: 0;
            background-color: rgba(50, 50, 50, 0.7);
            border-radius: 8px;
            overflow: hidden;
        }

        .emotion-link {
            display: inline-flex;
            justify-content: center;
            align-items: center;
            width: 32px;
            height: 32px;
            border-radius: 4px;
            position: relative;
            z-index: 1;
            overflow: hidden;
            transform-origin: center right;
            transition: width 0.2s ease-in;
            text-decoration: none;
            color: inherit;
            margin: 0 2px;
            cursor: pointer;
        }

        .emotion-link:before {
            position: absolute;
            z-index: -1;
            content: "";
            display: block;
            border-radius: 4px;
            width: 100%;
            height: 100%;
            top: 0;
            transform: translateX(100%);
            transition: transform 0.2s ease-in;
            transform-origin: center right;
            background-color: rgba(70, 70, 70, 0.7);
        }

        .emotion-link:hover,
        .emotion-link:focus,
        .emotion-link.active {
            outline: 0;
            width: 80px;
        }

        .emotion-link:hover:before,
        .emotion-link:focus:before,
        .emotion-link.active:before,
        .emotion-link:hover .emotion-link-title,
        .emotion-link:focus .emotion-link-title,
        .emotion-link.active .emotion-link-title {
            transform: translateX(0);
            opacity: 1;
        }

        .emotion-link.active {
            background-color: rgba(100, 100, 100, 0.7);
        }

        .emotion-link-icon {
            width: 20px;
            height: 20px;
            display: flex;
            justify-content: center;
            align-items: center;
            flex-shrink: 0;
            left: 6px;
            position: absolute;
        }

        .emotion-link-title {
            transform: translateX(100%);
            transition: transform 0.2s ease-in;
            transform-origin: center right;
            display: block;
            text-align: center;
            text-indent: 12px;
            width: 100%;
            font-size: 12px;
            opacity: 0;
        }

        /* 탭 내용 영역 */
        .emotion-status-content {
            padding: 16px;
            max-height: 70vh;
            overflow-y: auto;
            transition: height 0.3s ease;
        }

        .emotion-tab-content {
            display: none;
        }

        .emotion-tab-content.active {
            display: block;
        }

        /* 감정 이미지 표시 영역 */
        .emotion-image-display {
            width: 100%;
            height: 500px;
            margin: 0 auto 15px;
            background-size: contain;
            background-position: center;
            background-repeat: no-repeat;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
            transition: all 0.3s ease;
            background-color: rgba(255, 255, 255, 0.05);
        }

        .emotion-status-info {
            text-align: center;
            font-size: 15px;
            padding: 10px;
            background-color: rgba(255, 255, 255, 0.05);
            border-radius: 8px;
            margin-bottom: 15px;
        }

        .emotion-status-info p {
            margin: 8px 0;
        }

        /* 설정 관련 스타일 */
        .settings-section {
            margin-bottom: 15px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 8px;
            overflow: hidden;
        }

        .settings-section-header {
            padding: 8px 12px;
            background-color: rgba(60, 60, 60, 0.7);
            cursor: pointer;
            font-weight: bold;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 13px;
        }

        .settings-section-content {
            padding: 0px 12px;
            border-top: 1px solid rgba(255, 255, 255, 0.1);
            max-height: 0;
            overflow: hidden;
            transition: max-height 0.3s ease;
        }

        .settings-section.expanded .settings-section-content {
            max-height: 1000px;
            padding: 10px 12px;
        }

        .settings-section-toggle {
            transition: transform 0.3s;
        }

        .settings-section.expanded .settings-section-toggle {
            transform: rotate(180deg);
        }

        label {
            display: block;
            margin: 8px 0 4px;
            font-size: 12px;
            color: #ddd;
        }

        input[type="text"],
        input[type="password"],
        select,
        textarea {
            width: 100%;
            padding: 8px;
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 4px;
            margin-bottom: 8px;
            background-color: rgba(70, 70, 70, 0.7);
            color: #fff;
            font-size: 12px;
        }

        textarea {
            min-height: 80px;
            resize: vertical;
        }

        button {
            padding: 6px 12px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-weight: 500;
            transition: background-color 0.2s;
            margin-top: 8px;
            font-size: 12px;
        }

        .save-btn {
            background-color: #4CAF50;
            color: white;
        }

        .save-btn:hover {
            background-color: #3e9142;
        }

        .cancel-btn {
            background-color: #f44336;
            color: white;
        }

        .cancel-btn:hover {
            background-color: #d32f2f;
        }

        .test-btn {
            background-color: #2196F3;
            color: white;
        }

        .test-btn:hover {
            background-color: #1976d2;
        }

        /* 감정 이미지 행 스타일 */
        .emotion-image-row {
            display: flex;
            align-items: center;
            margin-bottom: 8px;
            font-size: 12px;
        }

        .emotion-image-row span {
            width: 60px;
            font-weight: bold;
        }

        .emotion-image-row input {
            flex: 1;
            margin: 0 8px;
            font-size: 11px;
        }

        .delete-emotion-btn {
            background-color: #f44336;
            color: white;
            border: none;
            border-radius: 4px;
            padding: 3px 6px;
            cursor: pointer;
            font-size: 10px;
        }

        .delete-emotion-btn:hover {
            background-color: #d32f2f;
        }

        /* 스위치 스타일 */
        .switch-container {
            display: flex;
            align-items: center;
            margin: 12px 0;
        }

        .switch {
            position: relative;
            display: inline-block;
            width: 36px;
            height: 20px;
            margin-right: 8px;
        }

        .switch input {
            opacity: 0;
            width: 0;
            height: 0;
        }

        .slider {
            position: absolute;
            cursor: pointer;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: #555;
            transition: .3s;
            border-radius: 20px;
        }

        .slider:before {
            position: absolute;
            content: "";
            height: 14px;
            width: 14px;
            left: 3px;
            bottom: 3px;
            background-color: white;
            transition: .3s;
            border-radius: 50%;
        }

        input:checked + .slider {
            background-color: #2196F3;
        }

        input:checked + .slider:before {
            transform: translateX(16px);
        }

        /* 캐릭터 그리드 */
        .character-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(60px, 1fr));
            gap: 8px;
            margin-top: 10px;
        }

        .character-card {
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 6px;
            padding: 8px;
            text-align: center;
            transition: all 0.2s;
            cursor: pointer;
            position: relative;
        }

        .character-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 3px 10px rgba(0, 0, 0, 0.2);
        }

        .character-card.active {
            border-color: #2196F3;
            background-color: rgba(33, 150, 243, 0.2);
        }

        .character-card-image {
            width: 40px;
            height: 40px;
            margin: 0 auto 6px;
            background-size: contain;
            background-position: center;
            background-repeat: no-repeat;
            border-radius: 50%;
            border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .character-card-name {
            font-size: 11px;
            font-weight: bold;
            margin-bottom: 4px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .character-card-options {
            position: absolute;
            top: 3px;
            right: 3px;
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background-color: rgba(80, 80, 80, 0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            font-size: 10px;
            opacity: 0.7;
            transition: all 0.2s;
        }

        .character-card-options:hover {
            opacity: 1;
            background-color: rgba(120, 120, 120, 0.7);
        }

        .add-character-card {
            border: 2px dashed rgba(255, 255, 255, 0.2);
            border-radius: 6px;
            padding: 8px;
            text-align: center;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 80px;
            cursor: pointer;
            transition: all 0.2s;
        }

        .add-character-card:hover {
            background-color: rgba(80, 80, 80, 0.3);
            border-color: #2196F3;
        }

        .add-character-icon {
            font-size: 18px;
            margin-bottom: 6px;
            color: #aaa;
        }

        .add-character-text {
            font-size: 11px;
            color: #ddd;
        }

        /* 캐릭터 옵션 메뉴 */
        .character-options-menu {
            position: absolute;
            background-color: rgba(40, 40, 40, 0.95);
            border-radius: 4px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
            padding: 6px 0;
            z-index: 10004;
            font-size: 12px;
            min-width: 120px;
            display: none;
        }

        .character-options-menu.visible {
            display: block;
        }

        .character-option-item {
            padding: 6px 12px;
            cursor: pointer;
            transition: background-color 0.2s;
        }

        .character-option-item:hover {
            background-color: rgba(80, 80, 80, 0.7);
        }

        .character-option-item.delete {
            color: #f44336;
        }

        /* 프리셋 저장 모달 */
        .preset-save-modal {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10003;
            opacity: 0;
            visibility: hidden;
            transition: opacity 0.3s, visibility 0.3s;
        }

        .preset-save-modal.visible {
            opacity: 1;
            visibility: visible;
        }

        .preset-save-content {
            width: 300px;
            background-color: rgba(40, 40, 40, 0.95);
            border-radius: 8px;
            padding: 16px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        }

        .preset-save-title {
            font-size: 16px;
            font-weight: bold;
            margin-bottom: 16px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            padding-bottom: 12px;
        }

        .preset-save-input {
            width: 100%;
            padding: 8px;
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 4px;
            margin-bottom: 16px;
            font-size: 13px;
            background-color: rgba(70, 70, 70, 0.7);
            color: #fff;
        }

        .preset-save-buttons {
            display: flex;
            justify-content: flex-end;
            gap: 8px;
        }

        .preset-save-button {
            padding: 6px 12px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-weight: 500;
            font-size: 12px;
        }

        .preset-save-button.save {
            background-color: #4CAF50;
            color: white;
        }

        .preset-save-button.cancel {
            background-color: #f44336;
            color: white;
        }

        /* 상태 정보 */
        .status-info {
            background-color: rgba(60, 60, 60, 0.7);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 4px;
            padding: 8px;
            margin-top: 12px;
            font-size: 12px;
        }

        .status-info.error {
            background-color: rgba(198, 40, 40, 0.2);
            border-color: rgba(255, 100, 100, 0.3);
        }

        .status-info.success {
            background-color: rgba(46, 125, 50, 0.2);
            border-color: rgba(100, 200, 100, 0.3);
        }

        /* 알림 바 스타일 */
        .notification-bar {
            position: fixed;
            top: 10px;
            right: 10px;
            padding: 8px 12px;
            background-color: rgba(50, 50, 50, 0.9);
            color: white;
            border-radius: 4px;
            z-index: 10002;
            opacity: 0;
            transition: opacity 0.3s;
            box-shadow: 0 2px 5px rgba(0, 0, 0, 0.3);
            max-width: 300px;
            font-size: 13px;
        }

        .notification-bar.error {
            background-color: rgba(198, 40, 40, 0.9);
        }

        .notification-bar.warn {
            background-color: rgba(255, 152, 0, 0.9);
        }

        .notification-bar.success {
            background-color: rgba(76, 175, 80, 0.9);
        }

        .notification-bar.visible {
            opacity: 1;
        }

        /* Add these styles for collapsible header behavior */
        .emotion-status-header {
            cursor: pointer;
            user-select: none;
        }
        
        .emotion-status-content {
            transition: max-height 0.3s ease, opacity 0.3s ease;
            max-height: 70vh;
            opacity: 1;
            overflow: hidden;
        }
        
        .emotion-status-container.collapsed .emotion-status-content {
            max-height: 0;
            opacity: 0;
            padding: 0;
        }

        .emotion-status-header .collapse-indicator {
            margin-left: 8px;
            transition: transform 0.3s ease;
            display: inline-block;
            font-size: 10px;
        }
        
        .emotion-status-container.collapsed .collapse-indicator {
            transform: rotate(180deg);
        }

        /* 모바일 반응형 스타일 */
        @media (max-width: 768px) {
             width: 100% !important;
             right: 0 !important;
             left: 0 !important;
             top: 0 !important;
             border-radius: 0 !important;
             z-index: 99;
            }

            .emotion-status-header {
                cursor: default;
            }

            .emotion-image-display {
                height: 40vh;
            }

            .emotion-link {
                width: 28px;
                height: 28px;
            }

            .emotion-link:hover,
            .emotion-link:focus,
            .emotion-link.active {
                width: 70px;
            }

            .emotion-link-icon {
                width: 18px;
                height: 18px;
            }

            .emotion-link-title {
                font-size: 11px;
            }

            .character-grid {
                grid-template-columns: repeat(auto-fill, minmax(50px, 1fr));
                gap: 6px;
            }
        }
    `);

    // Add this function to handle the header click events
    function setupHeaderAccordion(container) {
        const header = container.querySelector('.emotion-status-header');
        const content = container.querySelector('.emotion-status-content');

        // Add collapse indicator to header
        const titleElement = header.querySelector('.emotion-status-title');
        const indicator = document.createElement('span');
        indicator.className = 'collapse-indicator';
        indicator.textContent = '▼';
        titleElement.appendChild(indicator);

        // Check if previously collapsed
        const isCollapsed = localStorage_getValue('emotionContainerCollapsed', false);
        if (isCollapsed) {
            container.classList.add('collapsed');
            indicator.textContent = '▲'; // Flipped arrow when collapsed
        }

        // Set up click event on header
        header.addEventListener('click', function (e) {
            // Don't trigger accordion if clicking on menu items or dragging
            if (e.target.classList.contains('emotion-link') ||
                e.target.classList.contains('emotion-link-icon') ||
                e.target.classList.contains('emotion-link-title') ||
                isDragging) {
                return;
            }

            // Toggle collapsed state
            container.classList.toggle('collapsed');

            // Save collapsed state
            const isNowCollapsed = container.classList.contains('collapsed');
            localStorage_setValue('emotionContainerCollapsed', isNowCollapsed);

            // Update indicator
            indicator.textContent = isNowCollapsed ? '▲' : '▼';
        });
    }

    // 알림 표시 함수 - alert 대체용
    function showNotification(message, type = 'info', duration = 3000) {
        // 기존 알림 제거
        const existingNotifications = document.querySelectorAll('.notification-bar');
        existingNotifications.forEach(notification => {
            notification.remove();
        });

        // 새 알림 생성
        const notification = document.createElement('div');
        notification.className = `notification-bar ${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);

        // 표시 애니메이션
        setTimeout(() => {
            notification.classList.add('visible');
        }, 10);

        // 자동 제거
        setTimeout(() => {
            notification.classList.remove('visible');
            setTimeout(() => {
                notification.remove();
            }, 300);
        }, duration);
    }

    // 상태창 생성 함수
    function createEmotionStatusContainer() {
        // 이미 존재한다면 제거
        const existingContainer = document.getElementById('emotion-status-container');
        if (existingContainer) {
            existingContainer.remove();
        }

        // 새 컨테이너 생성
        const container = document.createElement('div');
        container.id = 'emotion-status-container';
        container.className = 'emotion-status-container';

        // 헤더 (드래그 및 메뉴 포함)
        const header = document.createElement('div');
        header.className = 'emotion-status-header draggable';
        header.innerHTML = `
            <div class="emotion-status-title">${config.characterName}의 상태창</div>
            <div class="emotion-menu">
                <div class="emotion-link active" data-tab="emotion" id="analyze-now-btn">
                    <span class="emotion-link-icon">😊</span>
                    <span class="emotion-link-title">감정</span>
                </div>
                <div class="emotion-link" data-tab="settings">
                    <span class="emotion-link-icon">⚙️</span>
                    <span class="emotion-link-title">설정</span>
                </div>
                <div class="emotion-link" data-tab="character">
                    <span class="emotion-link-icon">👤</span>
                    <span class="emotion-link-title">캐릭터</span>
                </div>
                <div class="emotion-link" data-tab="export">
                    <span class="emotion-link-icon">💾</span>
                    <span class="emotion-link-title">저장</span>
                </div>
            </div>
        `;

        // 내용 영역 (여러 탭으로 구성)
        const content = document.createElement('div');
        content.className = 'emotion-status-content';

        // 감정 탭
        const emotionTab = document.createElement('div');
        emotionTab.className = 'emotion-tab-content active';
        emotionTab.dataset.tab = 'emotion';
        emotionTab.innerHTML = `
            <div class="emotion-image-display"></div>
            <div class="emotion-status-info">
                <p class="current-emotion">감정: <span>중립</span></p>
                <p class="last-updated">마지막 업데이트: <span>-</span></p>
            </div>
        `;

        // 설정 탭
        const settingsTab = document.createElement('div');
        settingsTab.className = 'emotion-tab-content';
        settingsTab.dataset.tab = 'settings';
        settingsTab.innerHTML = `
                    <div class="settings-section">
                    <div class="settings-section expanded">
                <div class="settings-section-header">
                    <span>자동 분석</span>
                    <span class="settings-section-toggle">▲</span>
                </div>
                    <div class="switch-container">
                        <label class="switch">
                            <input type="checkbox" id="auto-analyze" ${config.autoAnalyze ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                        <span style="font-size: 12px;">자동 감정 분석 활성화</span>
                    </div>
                    <p style="font-size: 11px; color: #aaa; margin-top: -5px;">활성화 시 새 문단이 추가될 때마다 자동으로 감정을 분석합니다.</p>
                </div>
                </div>
            <div class="settings-section expanded">
                <div class="settings-section-header">
                    <span>API 설정</span>
                    <span class="settings-section-toggle">▲</span>
                </div>
                <div class="settings-section-content">
                    <label for="model-select">Gemini 모델:</label>
                    <select id="model-select">
                        <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                        <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                        <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                        <option value="gemini-1.0-pro">Gemini 1.0 Pro (Deprecated)</option>
                        <option value="gemini-pro">Gemini Pro (1.0) (Deprecated)</option>
                        <option value="gemini-ultra">Gemini Ultra (1.0)</option>
                        <option value="gemini-1.0-ultra-latest">Gemini 1.0 Ultra</option>
                        <option value="gemini-2.0-pro-exp">Gemini 2.0 Pro Experimental</option>
                    </select>

                    <label for="api-key">API 키:</label>
                    <input type="password" id="api-key" placeholder="API 키 입력" value="${config.apiKey || ''}">
                    <p style="font-size: 11px; color: #aaa; margin-top: -5px;">API 키는 로컬에 저장되며 API 요청 시에만 사용됩니다.</p>

                    <div class="status-info">
                        <strong>Gemini API 정보</strong><br>
                        Google AI Studio에서 발급받은 API 키를 입력하세요.
                    </div>

                    <div class="status-info" id="settings-status" style="display: none;"></div>

                    <button class="test-btn" id="test-settings" style="margin-top: 10px;">API 테스트</button>
                </div>
            </div>
            <div class="settings-section">
                            <div class="settings-section-header">
                    <span>커스텀 프롬프트</span>
                    <span class="settings-section-toggle">▼</span>
                </div>
                <div class="settings-section-content">
                    <label for="custom-prompt">AI 프롬프트 설정:</label>
                    <textarea id="custom-prompt">${config.customPrompt}</textarea>
                    <p style="font-size: 11px; color: #aaa;">{$characterName}은(는) 설정한 캐릭터 이름으로 대체됩니다.</p>
                </div>
            </div>



            <div style="display: flex; justify-content: flex-end; margin-top: 15px;">
                <button class="save-btn" id="save-settings-btn">설정 저장</button>
            </div>
        `;

        // 캐릭터 탭
        const characterTab = document.createElement('div');
        characterTab.className = 'emotion-tab-content';
        characterTab.dataset.tab = 'character';
        characterTab.innerHTML = `
            <div class="settings-section expanded">
                <div class="settings-section-header">
                    <span>캐릭터 프리셋</span>
                    <span class="settings-section-toggle">▲</span>
                </div>
                <div class="settings-section-content">
                    <p style="font-size: 12px; margin-bottom: 8px;">저장된 캐릭터를 선택하거나 새 캐릭터를 추가합니다.</p>
                    <div class="character-grid" id="character-grid">
                        <!-- 여기에 캐릭터 카드가 동적으로 추가됩니다 -->
                    </div>
                </div>
            </div>

                        <div class="settings-section">
                <div class="settings-section-header">
                    <span>감정 이미지 설정</span>
                    <span class="settings-section-toggle">▼</span>
                </div>
                <div class="settings-section-content">
                    <p style="font-size: 12px; margin-bottom: 8px;">각 감정에 표시할 이미지 URL을 입력하세요.</p>

                    <div id="emotion-images-container">
                        ${Object.entries(config.emotionImages).map(([emotion, url]) => `
                            <div class="emotion-image-row">
                                <span>${emotion}:</span>
                                <input type="text" class="emotion-image" data-emotion="${emotion}" placeholder="이미지 URL 입력" value="${url}">
                                ${defaultEmotions.includes(emotion) ? '' : '<button class="delete-emotion-btn" data-emotion="' + emotion + '">삭제</button>'}
                            </div>
                        `).join('')}
                    </div>

                    <button id="add-emotion-btn" style="margin-top: 10px;">감정 추가</button>
                </div>
            </div>
        `;

        // 내보내기/불러오기 탭
        const exportTab = document.createElement('div');
        exportTab.className = 'emotion-tab-content';
        exportTab.dataset.tab = 'export';
        exportTab.innerHTML = `
            <div class="settings-section expanded">
                <div class="settings-section-header">
                    <span>설정 내보내기/불러오기</span>
                    <span class="settings-section-toggle">▲</span>
                </div>
                <div class="settings-section-content">
                    <p style="font-size: 12px; margin-bottom: 12px;">현재 설정을 내보내거나 저장된 설정을 불러올 수 있습니다.</p>

                    <button id="export-settings-btn" class="test-btn" style="width: 100%; margin-bottom: 10px;">
                        <span style="margin-right: 5px;">⬆️</span> 설정 내보내기 (클립보드에 복사)
                    </button>

                    <button id="import-settings-btn" class="test-btn" style="width: 100%;">
                        <span style="margin-right: 5px;">⬇️</span> 설정 불러오기 (클립보드에서 가져오기)
                    </button>

                    <div style="margin-top: 15px; border-top: 1px solid rgba(255, 255, 255, 0.1); padding-top: 15px;">
                        <button id="reset-settings-btn" class="cancel-btn" style="width: 100%;">
                            <span style="margin-right: 5px;">🗑️</span> 모든 설정 초기화
                        </button>
                        <p style="font-size: 11px; color: #ff9999; margin-top: 5px;">주의: 모든 설정과 캐릭터 프리셋이 삭제됩니다.</p>
                    </div>
                </div>
            </div>
        `;

        // 내용 영역에 탭들 추가
        content.appendChild(emotionTab);
        content.appendChild(settingsTab);
        content.appendChild(characterTab);
        content.appendChild(exportTab);

        // 컨테이너에 헤더와 내용 영역 추가
        container.appendChild(header);
        container.appendChild(content);
        document.body.appendChild(container);

        // 탭 전환 이벤트 설정
        const menuLinks = container.querySelectorAll('.emotion-link');
        menuLinks.forEach(link => {
            link.addEventListener('click', function () {
                // 활성 탭 클래스 제거
                menuLinks.forEach(l => l.classList.remove('active'));
                container.querySelectorAll('.emotion-tab-content').forEach(tab => tab.classList.remove('active'));

                // 새 탭 활성화
                this.classList.add('active');
                activeTab = this.dataset.tab;
                const tabContent = container.querySelector(`.emotion-tab-content[data-tab="${activeTab}"]`);
                if (tabContent) {
                    tabContent.classList.add('active');
                }

                // 탭이 변경될 때 UI 업데이트
                if (activeTab === 'character') {
                    updateCharacterGrid();
                }
            });
        });

        // 섹션 접기/펼치기 이벤트 설정
        setupSectionToggles(container);

        // API 테스트 버튼 이벤트
        const testBtn = container.querySelector('#test-settings');
        if (testBtn) {
            testBtn.addEventListener('click', testApiSettings);
        }

        // 수동 분석 버튼 이벤트
        const analyzeBtn = container.querySelector('#analyze-now-btn');
        if (analyzeBtn) {
            analyzeBtn.addEventListener('click', manualAnalyze);
        }

        // 감정 추가 버튼 이벤트
        const addEmotionBtn = container.querySelector('#add-emotion-btn');
        if (addEmotionBtn) {
            addEmotionBtn.addEventListener('click', addNewEmotion);
        }

        // 설정 저장 버튼 이벤트
        const saveSettingsBtn = container.querySelector('#save-settings-btn');
        if (saveSettingsBtn) {
            saveSettingsBtn.addEventListener('click', saveSettings);
        }

        // 설정 내보내기 버튼 이벤트
        const exportBtn = container.querySelector('#export-settings-btn');
        if (exportBtn) {
            exportBtn.addEventListener('click', exportSettings);
        }

        // 설정 불러오기 버튼 이벤트
        const importBtn = container.querySelector('#import-settings-btn');
        if (importBtn) {
            importBtn.addEventListener('click', importSettings);
        }

        // 설정 초기화 버튼 이벤트
        const resetBtn = container.querySelector('#reset-settings-btn');
        if (resetBtn) {
            resetBtn.addEventListener('click', resetAllSettings);
        }

        // 자동 분석 토글 이벤트
        const autoAnalyzeToggle = container.querySelector('#auto-analyze');
        if (autoAnalyzeToggle) {
            autoAnalyzeToggle.addEventListener('change', function () {
                config.autoAnalyze = this.checked;
                saveConfig();
                setupObserver();
            });
        }

        // 감정 이미지 삭제 버튼 이벤트 설정
        setupDeleteEmotionButtons(container);

        // 위치 복원
        const savedPosition = localStorage_getValue('emotionContainerPosition', null);
        if (savedPosition) {
            if (savedPosition.left !== undefined) {
                container.style.left = savedPosition.left + 'px';
                container.style.top = savedPosition.top + 'px';
                container.style.right = ''; // right 속성 제거
            } else if (savedPosition.right !== undefined) {
                container.style.right = savedPosition.right + 'px';
                container.style.top = savedPosition.top + 'px';
            }
        } else {
            // 기본 위치 설정
            container.style.top = '80px';
            container.style.left = (window.innerWidth - 300) + 'px';
            container.style.right = '';
        }

        // 드래그 기능 설정
        setupDraggable(container, header);

        // 최근 감정 기록 업데이트
        updateEmotionHistoryUI();

        setupHeaderAccordion(container);


        // 모델 선택 값 설정
        const modelSelect = container.querySelector('#model-select');
        if (modelSelect && config.modelName) {
            // 모델 존재 여부 확인
            const optionExists = Array.from(modelSelect.options).some(option => option.value === config.modelName);
            if (optionExists) {
                modelSelect.value = config.modelName;
            } else {
                // 기본 모델로 설정
                modelSelect.value = "gemini-2.0-flash";
            }
        }

        // iOS/모바일 환경에서 초기 레이아웃 설정
        if (isMobile()) {
            container.style.position = 'fixed';
            container.style.top = '0';
            container.style.left = '0';
            container.style.width = '100%';
            container.style.right = '0';
            container.style.borderRadius = '0';
            container.style.zIndex = '99';

            // 이미지 크기 조정
            const imageDisplay = container.querySelector('.emotion-image-display');
            if (imageDisplay) {
                imageDisplay.style.height = '40vh';
            }
        }

        return container;
    }

    // 섹션 접기/펼치기 설정 함수
    function setupSectionToggles(container) {
        const sectionHeaders = container.querySelectorAll('.settings-section-header');
        sectionHeaders.forEach(header => {
            header.addEventListener('click', function () {
                const section = this.parentElement;
                const toggle = this.querySelector('.settings-section-toggle');

                if (section.classList.contains('expanded')) {
                    section.classList.remove('expanded');
                    toggle.textContent = '▼';
                } else {
                    section.classList.add('expanded');
                    toggle.textContent = '▲';
                }
            });
        });
    }

    // 감정 삭제 버튼 설정 함수
    function setupDeleteEmotionButtons(container) {
        container.querySelectorAll('.delete-emotion-btn').forEach(button => {
            button.addEventListener('click', function () {
                const emotion = this.dataset.emotion;
                const confirmDelete = confirm(`정말 "${emotion}" 감정을 삭제하시겠습니까?`);

                if (confirmDelete) {
                    // 화면에서 해당 감정 행 제거
                    this.closest('.emotion-image-row').remove();
                }
            });
        });
    }

    // 감정 추가 함수
    function addNewEmotion() {
        const emotionName = prompt('감정 이름 입력:');
        if (emotionName && emotionName.trim()) {
            const container = document.getElementById('emotion-images-container');
            if (container) {
                const newRow = document.createElement('div');
                newRow.className = 'emotion-image-row';
                newRow.innerHTML = `
                    <span>${emotionName}:</span>
                    <input type="text" class="emotion-image" data-emotion="${emotionName}" placeholder="이미지 URL 입력" value="">
                    <button class="delete-emotion-btn" data-emotion="${emotionName}">삭제</button>
                `;
                container.appendChild(newRow);

                // 새로 추가된 삭제 버튼에 이벤트 리스너 연결
                newRow.querySelector('.delete-emotion-btn').addEventListener('click', function () {
                    const emotion = this.dataset.emotion;
                    const confirmDelete = confirm(`정말 "${emotion}" 감정을 삭제하시겠습니까?`);

                    if (confirmDelete) {
                        // 화면에서 해당 감정 행 제거
                        this.closest('.emotion-image-row').remove();
                    }
                });
            }
        }
    }

    // 설정 저장 함수
    function saveSettings() {
        // 현재 캐릭터 이름 가져오기
        const characterName = config.characterName;

        // API 설정 가져오기
        const container = document.getElementById('emotion-status-container');
        const apiKey = container.querySelector('#api-key').value;
        const modelName = container.querySelector('#model-select').value;

        // API Key 유효성 검사
        if (apiKey.trim() === '') {
            showNotification('API 키를 입력해주세요', 'error');
            return;
        }

        // 커스텀 프롬프트 가져오기
        const customPrompt = container.querySelector('#custom-prompt').value;

        // 자동 분석 상태 가져오기
        const autoAnalyze = container.querySelector('#auto-analyze').checked;

        // 감정 이미지 가져오기
        const emotionImages = {};
        container.querySelectorAll('.emotion-image').forEach(input => {
            const emotion = input.dataset.emotion;
            const url = input.value;
            emotionImages[emotion] = url;
        });

        let hasEmptyImageUrl = false;
        Object.values(emotionImages).forEach(url => {
            if (url.trim() === '') {
                hasEmptyImageUrl = true;
            }
        });

        if (hasEmptyImageUrl) {
            const proceed = confirm('일부 감정에 이미지 URL이 설정되지 않았습니다. 그래도 계속할까요?');
            if (!proceed) return;
        }

        // 설정 저장
        config = {
            characterName,
            apiUrl: '', // Gemini는 API URL이 필요 없음
            apiKey,
            modelName,
            emotionImages,
            customPrompt,
            autoAnalyze
        };

        localStorage_setValue('emotionVisualizerConfig', config);

        // 상태창 제목 업데이트
        updateEmotionStatusTitle();

        // 감정 관찰자 업데이트
        setupObserver();

        // 프리셋 자동 업데이트 (현재 활성화된 프리셋이라면)
        updateCurrentPreset();

        showNotification('설정이 성공적으로 저장되었습니다!', 'success');
    }

    // 설정 내보내기 함수
    function exportSettings() {
        // 로컬 스토리지에서 모든 설정 가져오기
        const allSettings = {
            emotionVisualizerConfig: localStorage_getValue('emotionVisualizerConfig'),
            emotionHistory: localStorage_getValue('emotionHistory', []),
            emotionContainerPosition: localStorage_getValue('emotionContainerPosition'),
            emotionContainerCollapsed: localStorage_getValue('emotionContainerCollapsed', false),
            characterPresets: localStorage_getValue('characterPresets', {})
        };

        // JSON 문자열로 변환
        const settingsJson = JSON.stringify(allSettings, null, 2);

        // 클립보드에 복사
        navigator.clipboard.writeText(settingsJson)
            .then(() => {
                showNotification('모든 설정이 클립보드에 복사되었습니다!', 'success');
            })
            .catch(err => {
                console.error('클립보드 복사 실패:', err);
                showNotification('클립보드 복사에 실패했습니다.', 'error');

                // 복사 실패 시 대체 방법: 텍스트 영역 생성 및 선택
                const textArea = document.createElement('textarea');
                textArea.value = settingsJson;
                textArea.style.position = 'fixed';
                textArea.style.left = '0';
                textArea.style.top = '0';
                textArea.style.opacity = '0';
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();

                try {
                    document.execCommand('copy');
                    showNotification('모든 설정이 클립보드에 복사되었습니다!', 'success');
                } catch (err) {
                    showNotification('클립보드 복사에 실패했습니다. 수동으로 텍스트를 선택하여 복사하세요.', 'error');
                }

                document.body.removeChild(textArea);
            });
    }

    // 설정 불러오기 함수
    async function importSettings() {
        try {
            // 클립보드에서 텍스트 가져오기
            const clipboardText = await navigator.clipboard.readText();

            // JSON 파싱 시도
            try {
                const settings = JSON.parse(clipboardText);

                // 설정 유효성 검사
                if (!settings.emotionVisualizerConfig) {
                    throw new Error('유효하지 않은 설정 형식입니다.');
                }

                // 설정 저장
                localStorage_setValue('emotionVisualizerConfig', settings.emotionVisualizerConfig);

                if (settings.characterPresets) {
                    localStorage_setValue('characterPresets', settings.characterPresets);
                }

                if (settings.emotionHistory) {
                    localStorage_setValue('emotionHistory', settings.emotionHistory);
                }

                if (settings.emotionContainerPosition) {
                    localStorage_setValue('emotionContainerPosition', settings.emotionContainerPosition);
                }

                localStorage_setValue('emotionContainerCollapsed', settings.emotionContainerCollapsed || false);

                // 설정 적용
                config = settings.emotionVisualizerConfig;

                // 상태창 다시 만들기
                createEmotionStatusContainer();

                // UI 업데이트
                updateEmotionStatusTitle();
                updateEmotionHistoryUI();

                showNotification('설정을 성공적으로 불러왔습니다!', 'success');

            } catch (error) {
                console.error('JSON 파싱 오류:', error);
                showNotification('유효하지 않은 설정 형식입니다.', 'error');
            }
        } catch (error) {
            console.error('클립보드 읽기 실패:', error);
            showNotification('클립보드 읽기에 실패했습니다.', 'error');
        }
    }

    // 모든 설정 초기화 함수
    function resetAllSettings() {
        const confirmReset = confirm('정말로 모든 설정을 초기화하시겠습니까? 모든 캐릭터 프리셋과 설정이 삭제됩니다.');

        if (confirmReset) {
            localStorage_setValue('emotionVisualizerConfig', defaultConfig);
            localStorage_setValue('emotionHistory', []);
            localStorage_setValue('emotionContainerPosition', null);
            localStorage_setValue('emotionContainerCollapsed', false);
            localStorage_setValue('characterPresets', {});

            // 설정 다시 로드
            config = defaultConfig;

            // UI 다시 생성
            createEmotionStatusContainer();

            showNotification('모든 설정이 초기화되었습니다.', 'success');
        }
    }

    // 수동 감정 분석 함수
    function manualAnalyze() {
        const paragraphs = document.querySelectorAll('.paragraph');
        if (paragraphs.length > 0) {
            // 가장 최근 문단 분석
            const latestParagraph = paragraphs[paragraphs.length - 1];
            const paragraphText = latestParagraph.textContent;

            if (paragraphText && paragraphText.trim()) {
                // 분석 중 표시
                const analyzeBtn = document.getElementById('analyze-now-btn');
                if (analyzeBtn) {
                    analyzeBtn.disabled = true;
                }

                analyzeEmotion(paragraphText)
                    .then(emotion => {
                        if (emotion) {
                            updateEmotionImage(emotion);
                            showNotification(`감지된 감정: ${emotion}`, 'success');
                        }
                    })
                    .catch(error => {
                        console.error('감정 분석 실패:', error);
                        showNotification('감정 분석 실패', 'error');
                    })
                    .finally(() => {
                        // 버튼 상태 복원
                        if (analyzeBtn) {
                            analyzeBtn.disabled = false;
                        }
                    });
            } else {
                showNotification('분석할 텍스트가 없습니다', 'warn');
            }
        } else {
            showNotification('분석할 문단이 없습니다', 'warn');
        }
    }

    // API 설정 테스트 함수
    async function testApiSettings() {
        const container = document.getElementById('emotion-status-container');
        const modelName = container.querySelector('#model-select').value;
        const apiKey = container.querySelector('#api-key').value;
        const statusInfo = container.querySelector('#settings-status');

        // API 키 확인
        if (apiKey.trim() === '') {
            statusInfo.textContent = 'API 키가 설정되지 않았습니다.';
            statusInfo.className = 'status-info error';
            statusInfo.style.display = 'block';
            return;
        }

        // 테스트 상태 표시
        statusInfo.textContent = 'API 연결 테스트 중...';
        statusInfo.className = 'status-info';
        statusInfo.style.display = 'block';

        // 테스트 텍스트
        const testText = `${config.characterName}는 매우 행복해 보였다.`;

        try {
            const result = await testApiConnection('', apiKey, modelName, config.characterName, config.customPrompt, testText);
            if (result.success) {
                statusInfo.textContent = `테스트 성공! 감지된 감정: ${result.emotion}`;
                statusInfo.className = 'status-info success';
            } else {
                statusInfo.textContent = `테스트 실패: ${result.error}`;
                statusInfo.className = 'status-info error';
            }
        } catch (error) {
            statusInfo.textContent = `테스트 실패: ${error.message}`;
            statusInfo.className = 'status-info error';
        }
    }

    // API 연결 테스트 함수 (Gemini 전용)
    async function testApiConnection(apiUrl, apiKey, modelName, characterName, prompt, testText) {
        if (!apiKey) {
            return {
                success: false,
                error: 'API 키를 입력해주세요'
            };
        }

        // 프롬프트의 플레이스홀더 대체
        const testPrompt = prompt.replace('{$characterName}', characterName);

        // Gemini API 형식
        const requestBody = {
            contents: [
                {
                    parts: [
                        { text: `${testPrompt}\n\n텍스트: ${testText}` }
                    ]
                }
            ],
            generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 10,
                topP: 0.95,
                topK: 40
            }
        };

        // Gemini API URL 설정 - fetch API 사용
        const fullUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

        try {
            const response = await fetch(fullUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorText = await response.text();
                return {
                    success: false,
                    error: `HTTP 오류: ${response.status} - ${response.statusText || '알 수 없는 오류'} - 응답: ${errorText}`
                };
            }

            const data = await response.json();
            let emotion = '';

            // Gemini 응답 파싱
            if (data.candidates && data.candidates.length > 0 &&
                data.candidates[0].content && data.candidates[0].content.parts &&
                data.candidates[0].content.parts.length > 0) {

                emotion = data.candidates[0].content.parts[0].text.trim();
                return {
                    success: true,
                    emotion: emotion
                };
            } else {
                return {
                    success: false,
                    error: '응답 구조가 예상과 다릅니다. 응답: ' + JSON.stringify(data).substring(0, 200)
                };
            }
        } catch (error) {
            return {
                success: false,
                error: 'API 요청 실패: ' + error.message
            };
        }
    }

    // 감정 상태창 타이틀 업데이트
    function updateEmotionStatusTitle() {
        const container = document.getElementById('emotion-status-container');
        if (container) {
            const titleElement = container.querySelector('.emotion-status-title');
            if (titleElement) {
                titleElement.textContent = `${config.characterName}의 감정 상태`;
            }
        }
    }

    // 감정 이미지 업데이트 함수 (상태창 업데이트)
    function updateEmotionStatus(emotion) {
        // 기본 감정이 아닌 경우 중립으로 사용
        if (!config.emotionImages[emotion]) {
            console.warn(`감정에 대한 이미지 URL이 없습니다: ${emotion}`);
            emotion = '중립';
        }

        const imageUrl = config.emotionImages[emotion];
        if (!imageUrl) {
            console.warn('중립 감정 이미지도 설정되지 않았습니다.');
            return;
        }

        // 상태창이 없으면 생성
        let container = document.getElementById('emotion-status-container');
        if (!container) {
            container = createEmotionStatusContainer();
        }

        // 이미지 업데이트
        const imageDisplay = container.querySelector('.emotion-image-display');
        imageDisplay.style.backgroundImage = `url("${imageUrl}")`;

        // 현재 감정 텍스트 업데이트
        const currentEmotionText = container.querySelector('.current-emotion span');
        currentEmotionText.textContent = emotion;

        // 마지막 업데이트 시간
        const lastUpdatedText = container.querySelector('.last-updated span');
        const now = new Date();
        lastUpdatedText.textContent = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

        // 감정 기록 업데이트
        addEmotionToHistory(emotion);
    }

    // 감정 기록에 추가 (최대 3개)
    function addEmotionToHistory(emotion) {
        // 이전 기록 가져오기
        let emotionHistory = localStorage_getValue('emotionHistory', []);

        // 새 항목 추가
        const now = new Date();
        const timeString = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

        emotionHistory.unshift({
            emotion: emotion,
            time: timeString
        });

        // 최대 3개로 제한
        if (emotionHistory.length > 3) {
            emotionHistory = emotionHistory.slice(0, 3);
        }

        // 기록 저장
        localStorage_setValue('emotionHistory', emotionHistory);

        // UI 업데이트
        updateEmotionHistoryUI();
    }

    // 감정 기록 UI 업데이트
    function updateEmotionHistoryUI() {
        const container = document.getElementById('emotion-status-container');
        if (!container) return;

        const historyListElement = container.querySelector('.emotion-history-list');
        if (!historyListElement) return;

        // 기록 가져오기
        const emotionHistory = localStorage_getValue('emotionHistory', []);

        // UI 업데이트
        historyListElement.innerHTML = '';

        if (emotionHistory.length === 0) {
            historyListElement.innerHTML = '<div class="emotion-history-item" style="display: flex; justify-content: space-between; font-size: 12px;"><span>기록 없음</span></div>';
        } else {
            emotionHistory.forEach(item => {
                const historyItem = document.createElement('div');
                historyItem.className = 'emotion-history-item';
                historyItem.style.display = 'flex';
                historyItem.style.justifyContent = 'space-between';
                historyItem.style.fontSize = '12px';
                historyItem.style.marginBottom = '4px';
                historyItem.innerHTML = `
                    <span>${item.emotion}</span>
                    <span>${item.time}</span>
                `;
                historyListElement.appendChild(historyItem);
            });
        }
    }

    // 감정 이미지 업데이트 함수
    function updateEmotionImage(emotion) {
        updateEmotionStatus(emotion);
    }

    // 드래그 기능 설정 함수
    let isDragging = false;
    let offsetX, offsetY;

    function setupDraggable(element, handle) {
        handle = handle || element;

        // 기존 이벤트 리스너 제거 (중복 방지)
        handle.removeEventListener('mousedown', handleMouseDown);

        // 모바일에서는 드래그 기능 비활성화
        if (isMobile()) {
            return;
        }

        // 마우스 다운 핸들러
        handle.addEventListener('mousedown', handleMouseDown);
    }

    // 마우스 다운 이벤트 핸들러 함수
    function handleMouseDown(e) {
        if (e.target.classList.contains('emotion-link') ||
            e.target.classList.contains('emotion-link-icon') ||
            e.target.classList.contains('emotion-link-title')) {
            return; // 메뉴 버튼은 드래그 시작하지 않음
        }

        // Prevent click event when starting to drag
        e.preventDefault();

        // 모바일 모드에서는 드래그 처리하지 않음
        if (isMobile()) {
            return;
        }

        isDragging = true;

        const element = document.getElementById('emotion-status-container');
        if (!element) return;

        // 드래그 시작 위치 - 요소의 left, top 기준으로 변경
        const rect = element.getBoundingClientRect();
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;

        // 드래그 중 스타일 적용
        element.style.transition = 'none';
        element.style.opacity = '0.8';

        // 마우스 이동 이벤트
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }

    // 마우스 이동 이벤트 핸들러
    function handleMouseMove(e) {
        if (!isDragging) return;

        const element = document.getElementById('emotion-status-container');
        if (!element) return;

        // 새 위치 계산 (left, top 기준)
        const left = e.clientX - offsetX;
        const top = e.clientY - offsetY;

        // 창 영역 내로 제한
        element.style.left = Math.max(10, Math.min(window.innerWidth - element.offsetWidth - 10, left)) + 'px';
        element.style.top = Math.max(10, Math.min(window.innerHeight - element.offsetHeight - 10, top)) + 'px';

        // right 속성은 사용하지 않도록 제거
        element.style.right = '';
    }

    // 마우스 업 이벤트 핸들러
    function handleMouseUp() {
        if (!isDragging) return;

        isDragging = false;

        const element = document.getElementById('emotion-status-container');
        if (!element) return;

        // 원래 스타일로 복원
        element.style.transition = 'all 0.3s ease';
        element.style.opacity = '1';

        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);

        // 위치 저장 (left, top 기준으로 저장)
        const rect = element.getBoundingClientRect();
        localStorage_setValue('emotionContainerPosition', {
            left: rect.left,
            top: rect.top,
            isMobile: false
        });
    }

    // 모바일 환경 감지 함수 - 강화 버전
    function isMobile() {
        // iOS Safari 특별 감지
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
            (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

        // 화면 크기 검사 + UserAgent 검사
        return window.innerWidth <= 768 ||
            /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
            isIOS;
    }

    // AI API에 텍스트 전송하고 감정 가져오는 함수 (Gemini 전용)
    async function analyzeEmotion(text) {
        if (!config.apiKey) {
            showNotification('API 키가 설정되지 않았습니다', 'error');
            return null;
        }

        // 프롬프트에 감정 목록 자동 추가
        let prompt = config.customPrompt.replace('{$characterName}', config.characterName);

        // 감정 목록이 없으면 추가
        if (!prompt.includes("다음 감정 중 하나")) {
            const emotions = Object.keys(config.emotionImages);
            prompt += `\n다음 감정 중 하나만 응답하세요: ${emotions.join(', ')}.`;
        }

        // Gemini API 형식
        const requestBody = {
            contents: [
                {
                    parts: [
                        { text: `${prompt}\n\n텍스트: ${text}` }
                    ]
                }
            ],
            generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 10,
                topP: 0.95,
                topK: 40
            }
        };

        // Gemini API URL 구성
        const fullUrl = `https://generativelanguage.googleapis.com/v1beta/models/${config.modelName}:generateContent?key=${config.apiKey}`;

        try {
            const response = await fetch(fullUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('API 오류 응답:', response.status, errorText);
                showNotification(`API 요청 실패: ${response.statusText || '알 수 없는 오류'}`, 'error');
                return '중립';
            }

            const data = await response.json();
            let emotion = '';

            try {
                // Gemini 응답 파싱
                if (data.candidates && data.candidates.length > 0 &&
                    data.candidates[0].content && data.candidates[0].content.parts &&
                    data.candidates[0].content.parts.length > 0) {

                    emotion = data.candidates[0].content.parts[0].text.trim();
                } else {
                    console.warn('Gemini 응답 구조가 예상과 다릅니다', data);
                }
            } catch (error) {
                console.error('Gemini 응답 파싱 오류:', error);
            }

            // 감정 매칭 로직 수행
            return matchEmotion(emotion);
        } catch (error) {
            console.error('API 요청 오류:', error);
            showNotification('API 요청 오류', 'error');
            return '중립';
        }
    }

    // 감정 매칭 헬퍼 함수
    function matchEmotion(emotion) {
        if (!emotion) return '중립';

        // 소문자로 변환하여 비교
        const lowerEmotion = emotion.toLowerCase();

        // 직접 매칭 시도
        const emotions = Object.keys(config.emotionImages);

        // 1. 정확한 매칭 (감정 단어 자체가 응답)
        for (const e of emotions) {
            if (lowerEmotion === e.toLowerCase() ||
                lowerEmotion.endsWith(e.toLowerCase()) ||
                lowerEmotion.startsWith(e.toLowerCase())) {
                return e;
            }
        }

        // 2. 부분 매칭 (응답에 감정 단어가 포함됨)
        for (const e of emotions) {
            if (lowerEmotion.includes(e.toLowerCase())) {
                return e;
            }
        }

        // 3. 키워드 매핑
        const emotionMapping = {
            '행복': ['기쁨', '즐거움', '행복감', '좋아', '좋은', '즐거운', '기쁜', '긍정적'],
            '슬픔': ['슬픔', '우울', '눈물', '아픔', '상처', '괴로움', '고통', '부정적'],
            '분노': ['화', '분노', '짜증', '불만', '격분', '화난', '화가', '싫어'],
            '놀람': ['놀람', '충격', '경악', '당황', '깜짝', '예상치 못한', '갑작스러운'],
            '중립': ['보통', '일반적', '평범', '중립', '무감정', '담담', '차분']
        };

        for (const [emotion, keywords] of Object.entries(emotionMapping)) {
            for (const keyword of keywords) {
                if (lowerEmotion.includes(keyword)) {
                    if (emotions.includes(emotion)) {
                        return emotion;
                    }
                }
            }
        }

        return '중립'; // 감정을 찾지 못한 경우 중립으로 기본 설정
    }

    // 캐릭터 그리드 업데이트 함수
    function updateCharacterGrid() {
        const grid = document.getElementById('character-grid');
        if (!grid) return;

        // 그리드 초기화
        grid.innerHTML = '';

        // 저장된 캐릭터 프리셋 가져오기
        const characterPresets = localStorage_getValue('characterPresets', {});
        const currentCharacter = config.characterName;

        // 캐릭터 카드 추가
        Object.keys(characterPresets).forEach(characterName => {
            const preset = characterPresets[characterName];
            const card = document.createElement('div');
            card.className = `character-card${characterName === currentCharacter ? ' active' : ''}`;
            card.dataset.character = characterName;

            // 중립 이미지 URL 또는 기본 이미지
            const imageUrl = preset.emotionImages && preset.emotionImages['중립']
                ? preset.emotionImages['중립']
                : 'https://example.com/neutral.png';

            card.innerHTML = `
                <div class="character-card-image" style="background-image: url('${imageUrl}')"></div>
                <div class="character-card-name">${characterName}</div>
                <div class="character-card-options">⋮</div>
            `;

            // 카드 클릭 이벤트 - 캐릭터 로드
            card.addEventListener('click', function (e) {
                if (!e.target.classList.contains('character-card-options')) {
                    loadCharacterPreset(characterName);
                }
            });

            // 옵션 버튼 클릭 이벤트
            const optionsBtn = card.querySelector('.character-card-options');
            optionsBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                const rect = this.getBoundingClientRect();
                showCharacterOptionsMenu(rect.right, rect.bottom, characterName);
            });

            grid.appendChild(card);
        });

        // 추가 버튼 카드
        const addCard = document.createElement('div');
        addCard.className = 'add-character-card';
        addCard.innerHTML = `
            <div class="add-character-icon">+</div>
            <div class="add-character-text">새 캐릭터</div>
        `;

        addCard.addEventListener('click', () => {
            showSavePresetModal();
        });

        grid.appendChild(addCard);
    }

    // 캐릭터 옵션 메뉴 표시
    function showCharacterOptionsMenu(x, y, characterName) {
        // 기존 메뉴 제거
        const existingMenu = document.getElementById('character-options-menu');
        if (existingMenu) {
            existingMenu.remove();
        }

        // 새 메뉴 생성
        const menu = document.createElement('div');
        menu.id = 'character-options-menu';
        menu.className = 'character-options-menu';
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;

        menu.innerHTML = `
            <div class="character-option-item update">업데이트</div>
            <div class="character-option-item delete">삭제</div>
        `;

        document.body.appendChild(menu);

        // 메뉴 위치 조정 (화면 벗어남 방지)
        const menuRect = menu.getBoundingClientRect();
        if (menuRect.right > window.innerWidth) {
            menu.style.left = `${x - menuRect.width}px`;
        }
        if (menuRect.bottom > window.innerHeight) {
            menu.style.top = `${y - menuRect.height}px`;
        }

        // 메뉴 표시
        setTimeout(() => {
            menu.classList.add('visible');
        }, 10);

        // 이벤트 리스너
        menu.querySelector('.update').addEventListener('click', () => {
            showSavePresetModal(characterName);
            menu.remove();
        });

        menu.querySelector('.delete').addEventListener('click', () => {
            if (confirm(`"${characterName}" 캐릭터를 삭제하시겠습니까?`)) {
                deleteCharacterPreset(characterName);
            }
            menu.remove();
        });

        // 외부 클릭 시 메뉴 닫기
        function handleClickOutside(e) {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', handleClickOutside);
            }
        }

        setTimeout(() => {
            document.addEventListener('click', handleClickOutside);
        }, 10);
    }

    // 프리셋 저장 모달 표시
    function showSavePresetModal(characterName = '') {
        // 기존 모달 제거
        const existingModal = document.getElementById('preset-save-modal');
        if (existingModal) {
            existingModal.remove();
        }

        // 새 모달 생성
        const modal = document.createElement('div');
        modal.id = 'preset-save-modal';
        modal.className = 'preset-save-modal';

        // 업데이트 또는 새로 생성 모드
        const isUpdate = characterName !== '';
        const modalTitle = isUpdate ? `"${characterName}" 프리셋 업데이트` : '새 캐릭터 프리셋 저장';

        modal.innerHTML = `
            <div class="preset-save-content">
                <div class="preset-save-title">${modalTitle}</div>
                ${!isUpdate ? `
                    <input type="text" class="preset-save-input" placeholder="캐릭터 이름 입력" value="${characterName}">
                ` : ''}
                <div class="preset-save-buttons">
                    <button class="preset-save-button cancel">취소</button>
                    <button class="preset-save-button save">${isUpdate ? '업데이트' : '저장'}</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // 모달 표시
        setTimeout(() => {
            modal.classList.add('visible');
        }, 10);

        // 이벤트 리스너
        modal.querySelector('.cancel').addEventListener('click', () => {
            modal.classList.remove('visible');
            setTimeout(() => {
                modal.remove();
            }, 300);
        });

        modal.querySelector('.save').addEventListener('click', () => {
            let presetName = characterName;

            if (!isUpdate) {
                presetName = modal.querySelector('.preset-save-input').value.trim();
                if (!presetName) {
                    alert('캐릭터 이름을 입력해주세요.');
                    return;
                }

                // 새 프리셋 저장 시 현재 캐릭터 이름 업데이트
                config.characterName = presetName;

                // 상태창 제목 업데이트
                updateEmotionStatusTitle();
            }

            saveCurrentAsPreset(presetName);

            modal.classList.remove('visible');
            setTimeout(() => {
                modal.remove();
            }, 300);
        });
    }

    // 현재 설정을 프리셋으로 저장
    function saveCurrentAsPreset(characterName) {
        // 현재 설정의 이미지 URL 가져오기
        const emotionImages = {};

        // 감정 이미지 입력 필드에서 값 가져오기
        document.querySelectorAll('.emotion-image').forEach(input => {
            const emotion = input.dataset.emotion;
            const url = input.value;
            emotionImages[emotion] = url;
        });

        // 현재 API 설정 가져오기
        const container = document.getElementById('emotion-status-container');
        const apiKey = container.querySelector('#api-key').value;
        const modelName = container.querySelector('#model-select').value;
        const customPrompt = container.querySelector('#custom-prompt').value;
        const autoAnalyze = container.querySelector('#auto-analyze').checked;

        // 프리셋 데이터 구성
        const presetData = {
            emotionImages: emotionImages,
            apiKey: apiKey,
            apiUrl: '',
            modelName: modelName,
            customPrompt: customPrompt,
            autoAnalyze: autoAnalyze
        };

        // 설정도 업데이트
        config.apiKey = apiKey;
        config.modelName = modelName;
        config.customPrompt = customPrompt;
        config.autoAnalyze = autoAnalyze;
        config.emotionImages = emotionImages;

        // 설정 저장
        localStorage_setValue('emotionVisualizerConfig', config);

        // 저장된 프리셋 가져오기
        let characterPresets = localStorage_getValue('characterPresets', {});

        // 새 프리셋 추가 또는 업데이트
        characterPresets[characterName] = presetData;

        // 저장
        localStorage_setValue('characterPresets', characterPresets);

        // 알림 표시
        showNotification(`"${characterName}" 프리셋이 저장되었습니다.`, 'success');

        // 캐릭터 그리드 업데이트
        updateCharacterGrid();
    }

    // 캐릭터 프리셋 불러오기
    function loadCharacterPreset(characterName) {
        // 저장된 프리셋 가져오기
        const characterPresets = localStorage_getValue('characterPresets', {});

        // 프리셋 확인
        if (!characterPresets[characterName]) {
            showNotification(`"${characterName}" 프리셋을 찾을 수 없습니다.`, 'error');
            return;
        }

        // 프리셋 데이터 가져오기
        const presetData = characterPresets[characterName];

        // 현재 설정에 적용
        config.characterName = characterName;
        config.emotionImages = { ...presetData.emotionImages };
        config.apiKey = presetData.apiKey;
        config.apiUrl = presetData.apiUrl || '';
        config.modelName = presetData.modelName;
        config.customPrompt = presetData.customPrompt;
        config.autoAnalyze = presetData.autoAnalyze;

        // 설정 저장
        localStorage_setValue('emotionVisualizerConfig', config);

        // 상태창 타이틀 업데이트
        updateEmotionStatusTitle();

        // UI 업데이트
        updateCharacterGrid();

        // 설정 탭 내용 업데이트
        const container = document.getElementById('emotion-status-container');
        if (container) {
            // API 키 업데이트
            const apiKeyField = container.querySelector('#api-key');
            if (apiKeyField) {
                apiKeyField.value = presetData.apiKey || '';
            }

            // 모델 선택 업데이트
            const modelSelect = container.querySelector('#model-select');
            if (modelSelect && presetData.modelName) {
                // 모델 존재 여부 확인
                const optionExists = Array.from(modelSelect.options).some(option => option.value === presetData.modelName);
                if (optionExists) {
                    modelSelect.value = presetData.modelName;
                } else {
                    // 기본 모델로 설정
                    modelSelect.value = "gemini-2.0-flash";
                }
            }

            // 커스텀 프롬프트 업데이트
            const customPromptField = container.querySelector('#custom-prompt');
            if (customPromptField) {
                customPromptField.value = presetData.customPrompt || '';
            }

            // 자동 분석 체크박스 업데이트
            const autoAnalyzeCheckbox = container.querySelector('#auto-analyze');
            if (autoAnalyzeCheckbox) {
                autoAnalyzeCheckbox.checked = presetData.autoAnalyze || false;
            }

            // 감정 이미지 입력 필드 업데이트
            const emotionImagesContainer = container.querySelector('#emotion-images-container');
            if (emotionImagesContainer && presetData.emotionImages) {
                emotionImagesContainer.innerHTML = '';

                Object.entries(presetData.emotionImages).forEach(([emotion, url]) => {
                    const row = document.createElement('div');
                    row.className = 'emotion-image-row';
                    row.innerHTML = `
                        <span>${emotion}:</span>
                        <input type="text" class="emotion-image" data-emotion="${emotion}" placeholder="이미지 URL 입력" value="${url}">
                        ${defaultEmotions.includes(emotion) ? '' : '<button class="delete-emotion-btn" data-emotion="' + emotion + '">삭제</button>'}
                    `;
                    emotionImagesContainer.appendChild(row);
                });

                // 삭제 버튼 이벤트 리스너 추가
                setupDeleteEmotionButtons(container);
            }
        }

        // 감정 관찰자 업데이트
        setupObserver();

        // 알림 표시
        showNotification(`"${characterName}" 프리셋이 로드되었습니다.`, 'success');
    }

    // 캐릭터 프리셋 삭제
    function deleteCharacterPreset(characterName) {
        // 저장된 프리셋 가져오기
        let characterPresets = localStorage_getValue('characterPresets', {});

        // 프리셋 확인
        if (!characterPresets[characterName]) {
            showNotification(`"${characterName}" 프리셋을 찾을 수 없습니다.`, 'error');
            return;
        }

        // 현재 선택된 캐릭터인 경우 확인
        if (characterName === config.characterName) {
            if (!confirm(`"${characterName}"은(는) 현재 사용 중인 캐릭터입니다. 그래도 삭제하시겠습니까?`)) {
                return;
            }
        }

        // 프리셋 삭제
        delete characterPresets[characterName];

        // 저장
        localStorage_setValue('characterPresets', characterPresets);

        // UI 업데이트
        updateCharacterGrid();

        // 알림 표시
        showNotification(`"${characterName}" 프리셋이 삭제되었습니다.`, 'success');
    }

    // 설정 저장 함수
    function saveConfig() {
        localStorage_setValue('emotionVisualizerConfig', config);
    }

    // 설정 저장 시 프리셋 자동 업데이트 기능 추가
    function updateCurrentPreset() {
        const characterName = config.characterName;
        if (!characterName) return;

        // 저장된 프리셋 가져오기
        let characterPresets = localStorage_getValue('characterPresets', {});

        // 현재 캐릭터가 저장된 프리셋인지 확인
        if (characterPresets[characterName]) {
            // 현재 설정의 이미지 URL 가져오기
            const currentEmotionImages = {};
            document.querySelectorAll('.emotion-image').forEach(input => {
                const emotion = input.dataset.emotion;
                const url = input.value;
                currentEmotionImages[emotion] = url;
            });

            // 프리셋 업데이트
            characterPresets[characterName] = {
                emotionImages: currentEmotionImages,
                apiKey: config.apiKey,
                apiUrl: config.apiUrl,
                modelName: config.modelName,
                customPrompt: config.customPrompt,
                autoAnalyze: config.autoAnalyze
            };

            // 설정에도 업데이트된 이미지 URL 반영
            config.emotionImages = currentEmotionImages;

            // 저장
            localStorage_setValue('characterPresets', characterPresets);
        }
    }

    // 새 문단을 관찰하는 메인 함수
    function setupObserver() {
        // 이미 생성된 관찰자가 있다면 먼저 연결 해제
        if (window.paragraphObserver) {
            window.paragraphObserver.disconnect();
        }

        // 자동 분석이 꺼져 있으면 여기서 함수 종료
        if (!config.autoAnalyze) {
            return;
        }

        // 새 관찰자 생성
        window.paragraphObserver = new MutationObserver(mutations => {
            mutations.forEach(mutation => {
                if (mutation.type === 'childList' && mutation.addedNodes.length) {
                    mutation.addedNodes.forEach(node => {
                        if (node.classList && node.classList.contains('paragraph')) {
                            const paragraphText = node.textContent;

                            // 텍스트가 있는 경우에만 처리
                            if (paragraphText && paragraphText.trim()) {
                                analyzeEmotion(paragraphText)
                                    .then(emotion => {
                                        if (emotion) {
                                            updateEmotionImage(emotion);
                                            showNotification(`감지된 감정: ${emotion}`, 'success', 1500);
                                        }
                                    })
                                    .catch(error => {
                                        console.error('감정 분석 실패:', error);
                                        showNotification('감정 분석 실패', 'error');
                                    });
                            }
                        }
                    });
                }
            });
        });

        // 문단 추가를 관찰하기 위해 document 관찰 시작
        window.paragraphObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    // 화면 크기 변경 이벤트 처리 함수
    function handleResize() {
        const container = document.getElementById('emotion-status-container');
        if (!container) return;

        const currentIsMobile = isMobile();

        // 상태가 변경되었을 때만 처리 (모바일 -> 데스크톱 또는 데스크톱 -> 모바일)
        if (previousIsMobile !== currentIsMobile) {
            if (currentIsMobile) {
                // 데스크톱 -> 모바일로 전환
                // 현재 위치와 스타일 저장 (이후 데스크톱으로 돌아갈 때 사용)
                const rect = container.getBoundingClientRect();
                originalContainerStyle = {
                    width: container.style.width || '280px',
                    borderRadius: container.style.borderRadius || '12px',
                    left: rect.left,
                    top: rect.top
                };

                // 모바일 스타일 적용
                container.style.top = '0';
                container.style.left = '0';
                container.style.width = '100%';
                container.style.right = '';
                container.style.borderRadius = '0';

                // 헤더에서 draggable 클래스 제거
                const header = container.querySelector('.emotion-status-header');
                if (header) {
                    header.classList.remove('draggable');
                }
            } else {
                // 모바일 -> 데스크톱으로 전환
                // 저장된 원래 스타일로 복원
                container.style.width = '400px';
                container.style.borderRadius = originalContainerStyle.borderRadius;

                // 저장된 위치가 있으면 해당 위치로, 없으면 기본 위치로
                if (originalContainerStyle.left && originalContainerStyle.top) {
                    container.style.left = originalContainerStyle.left + 'px';
                    container.style.top = originalContainerStyle.top + 'px';
                } else {
                    const savedPosition = localStorage_getValue('emotionContainerPosition', null);
                    if (savedPosition && !savedPosition.isMobile) {
                        if (savedPosition.left !== undefined) {
                            container.style.left = savedPosition.left + 'px';
                            container.style.top = savedPosition.top + 'px';
                        } else if (savedPosition.right !== undefined) {
                            container.style.right = savedPosition.right + 'px';
                            container.style.top = savedPosition.top + 'px';
                        }
                    } else {
                        container.style.top = '80px';
                        container.style.left = (window.innerWidth - 300) + 'px';
                    }
                }

                // 헤더에 draggable 클래스 추가
                const header = container.querySelector('.emotion-status-header');
                if (header) {
                    header.classList.add('draggable');
                }

                // 드래그 이벤트 재설정
                setupDraggable(container, container.querySelector('.emotion-status-header'));
            }

            // 현재 상태를 이전 상태로 업데이트
            previousIsMobile = currentIsMobile;
        }
    }

    // 이전 화면 상태를 추적하기 위한 변수
    let previousIsMobile = isMobile();

    // 상태창의 원래 스타일을 저장하는 변수
    let originalContainerStyle = {
        width: '280px',
        borderRadius: '12px'
    };

    // 창 크기 변경 시 이벤트 리스너 등록
    window.addEventListener('resize', handleResize);

    // 초기 로드 시에도 화면 크기 확인
    window.addEventListener('load', () => {
        // 감정 상태창 생성
        createEmotionStatusContainer();

        // 화면 크기에 따른 스타일 적용
        handleResize();

        // 일정 시간 후 관찰자 설정 (페이지 초기화를 위한 시간 제공)
        setTimeout(setupObserver, 2000);
    });

    // iOS/모바일에서 강제로 모바일 레이아웃 적용하는 함수
    function forceApplyMobileLayout() {
        console.log("강제 모바일 레이아웃 적용 시도");
        const container = document.getElementById('emotion-status-container');
        if (!container) return;

        // 모바일 기기 감지
        if (isMobile()) {
            console.log("모바일 기기 감지됨, 레이아웃 적용");
            // 이전 스타일 저장
            const rect = container.getBoundingClientRect();
            originalContainerStyle = {
                width: container.style.width || '280px',
                borderRadius: container.style.borderRadius || '12px',
                left: rect.left,
                top: rect.top
            };

            // 강제로 모바일 스타일 적용
            container.style.position = 'fixed';
            container.style.top = '0';
            container.style.left = '0';
            container.style.width = '100%';
            container.style.right = '0';
            container.style.borderRadius = '0';
            container.style.zIndex = '99';

            // 드래그 비활성화
            const header = container.querySelector('.emotion-status-header');
            if (header) {
                header.classList.remove('draggable');
            }

            // 상태 업데이트
            previousIsMobile = true;

            // 이미지 크기 조정
            const imageDisplay = container.querySelector('.emotion-image-display');
            if (imageDisplay) {
                imageDisplay.style.height = '40vh';
            }
        }
    }

    // 초기 로드 시에도 화면 크기 확인
    window.addEventListener('load', () => {
        // 감정 상태창 생성
        createEmotionStatusContainer();

        // iOS/모바일 체크 및 강제 적용
        setTimeout(forceApplyMobileLayout, 500);

        // 화면 크기에 따른 스타일 적용
        handleResize();

        // 일정 시간 후 관찰자 설정 (페이지 초기화를 위한 시간 제공)
        setTimeout(setupObserver, 2000);

        // 추가: 재시도 로직
        setTimeout(forceApplyMobileLayout, 2000);
        setTimeout(forceApplyMobileLayout, 5000);
    });
})();
