/*
 * Copyright 2022 The Android Open Source Project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package com.yinni.samples.apps.yinni.core.data.repository

import com.yinni.samples.apps.yinni.core.data.Synchronizer
import com.yinni.samples.apps.yinni.core.data.changeListSync
import com.yinni.samples.apps.yinni.core.data.model.asEntity
import com.yinni.samples.apps.yinni.core.database.dao.TopicDao
import com.yinni.samples.apps.yinni.core.database.model.TopicEntity
import com.yinni.samples.apps.yinni.core.database.model.asExternalModel
import com.yinni.samples.apps.yinni.core.datastore.ChangeListVersions
import com.yinni.samples.apps.yinni.core.model.data.Topic
import com.yinni.samples.apps.yinni.core.network.NiaNetworkDataSource
import com.yinni.samples.apps.yinni.core.network.model.NetworkTopic
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject

/**
 * Disk storage backed implementation of the [TopicsRepository].
 * Reads are exclusively from local storage to support offline access.
 */
internal class OfflineFirstTopicsRepository @Inject constructor(
    private val topicDao: TopicDao,
    private val network: NiaNetworkDataSource,
) : TopicsRepository {

    override fun getTopics(): Flow<List<Topic>> =
        topicDao.getTopicEntities()
            .map { it.map(TopicEntity::asExternalModel) }

    override fun getTopic(id: String): Flow<Topic> =
        topicDao.getTopicEntity(id).map { it.asExternalModel() }

    override suspend fun syncWith(synchronizer: Synchronizer): Boolean =
        synchronizer.changeListSync(
            versionReader = ChangeListVersions::topicVersion,
            changeListFetcher = { currentVersion ->
                network.getTopicChangeList(after = currentVersion)
            },
            versionUpdater = { latestVersion ->
                copy(topicVersion = latestVersion)
            },
            modelDeleter = topicDao::deleteTopics,
            modelUpdater = { changedIds ->
                val networkTopics = network.getTopics(ids = changedIds)
                topicDao.upsertTopics(
                    entities = networkTopics.map(NetworkTopic::asEntity),
                )
            },
        )
}
